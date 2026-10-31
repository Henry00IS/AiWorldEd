import * as THREE from 'three';
import type { FacePickResult } from '@/selection/face/raycaster_face_selection.js';
import { CommandTransformRotate } from '@/transform/commands/command_transform_rotate.js';
import { PreviewGridFaceAlign } from '@/tools/grid/preview_grid_face_align.js';
import { applySnapFaceAlign, applySnapFaceSeat } from './snap_face_pose_apply.js';
import { recordAlignPoseCommand } from './snap_align_pose_command.js';
import { ALIGN_SURFACE_LOCKS } from './snap_align_surface_locks.js';
import type { SnapAlignCache } from './snap_align_cache.js';
import type { SnapAlignHost } from './snap_align_host.js';
import { alignPointerRay } from './snap_align_pointer_ray.js';
import { resolveAlignPane } from './snap_align_pane.js';
import type { SnapFaceSample } from './snap_face_sample.js';

/** Whether the session rotates toward a face or slides onto its plane. */
export type FaceAlignMode = 'align' | 'seat';

const noExcludedRoots: ReadonlySet<string> = new Set();

/**
 * Two-click session for Face Align or Seat. The source sample is stored at the
 * first click. Later picks read the cache and skip that mesh. Commits keep
 * brush face UV matrices with the brush.
 */
export class HandlerFaceAlign {
  private readonly deps: SnapAlignHost;
  private readonly mode: FaceAlignMode;
  private readonly cache: SnapAlignCache;
  private preview: PreviewGridFaceAlign | null;
  private armed: boolean;
  private source: SnapFaceSample | null;
  private startPosition: THREE.Vector3 | null;
  private startQuaternion: THREE.Quaternion | null;
  private readonly excludedRootIds: Set<string>;

  /**
   * Creates a face session.
   *
   * @param deps Scene, undo, and solid refresh.
   * @param mode Align rotates. Seat only slides.
   * @param cache Targets captured when the tool armed.
   */
  constructor(deps: SnapAlignHost, mode: FaceAlignMode, cache: SnapAlignCache) {
    this.deps = deps;
    this.mode = mode;
    this.cache = cache;
    this.preview = null;
    this.armed = false;
    this.source = null;
    this.startPosition = null;
    this.startQuaternion = null;
    this.excludedRootIds = new Set();
  }

  /**
   * Returns whether the tool is waiting for a click.
   *
   * @returns True while armed.
   */
  isArmed(): boolean {
    return this.armed;
  }

  /** Arms the session and asks for the source face. */
  arm(): void {
    this.cancel();
    this.armed = true;
    this.ensurePreview();
    this.deps.showStatusMessage(sourcePrompt(this.mode));
  }

  /**
   * Restores the start pose and leaves the tool. The compiled solid is left
   * untouched because preview never rebuilt it.
   *
   * @returns True when a session was cancelled.
   */
  cancel(): boolean {
    if (!this.armed && !this.source) {
      return false;
    }
    this.restoreStartPose();
    this.clearSession();
    return true;
  }

  /**
   * Previews the stored source against the cached face under the pointer.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param ownerDocument Document that owns the coordinates.
   */
  updateHover(clientX: number, clientY: number, ownerDocument: Document | null): void {
    if (!this.armed) {
      return;
    }
    const sample = this.pickSample(clientX, clientY, ownerDocument);
    this.showHover(sample);
    this.previewAlignment(sample);
  }

  /**
   * Stores the source face, or commits a face on another mesh.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param ownerDocument Document that owns the coordinates.
   * @returns True when the click was consumed.
   */
  tryClick(clientX: number, clientY: number, ownerDocument: Document | null): boolean {
    if (!this.armed) {
      return false;
    }
    if (!this.paneReady(clientX, clientY, ownerDocument)) {
      return true;
    }
    const sample = this.pickSample(clientX, clientY, ownerDocument);
    if (!this.source) {
      this.captureWhenPresent(sample);
      return true;
    }
    this.commitWhenDifferent(sample);
    return true;
  }

  /**
   * Stores the source face and its start pose.
   *
   * @param sample Source face.
   */
  private captureSource(sample: SnapFaceSample): void {
    this.source = sample;
    this.startPosition = sample.root.position.clone();
    this.startQuaternion = sample.root.quaternion.clone();
    this.excludedRootIds.add(sample.root.uuid);
    this.deps.showStatusMessage(targetPrompt(this.mode));
  }

  /**
   * Commits when the target mesh is not the source mesh.
   *
   * @param target Target face.
   */
  private commitTarget(target: SnapFaceSample): void {
    const source = this.source;
    if (!source || target.root === source.root) {
      this.rejectSameObject();
      return;
    }
    this.applyAlignment(source, target);
    this.recordPose(source.root);
    this.deps.showStatusMessage(this.mode === 'seat' ? 'Face seated' : 'Face aligned');
    this.clearSession();
  }

  /**
   * Applies the session mode to the source root.
   *
   * @param source Source face stored at the first click.
   * @param target Target face from the cache.
   */
  private applyAlignment(source: SnapFaceSample, target: SnapFaceSample): void {
    if (!this.startPosition || !this.startQuaternion) {
      return;
    }
    if (this.mode === 'seat') {
      applySnapFaceSeat(source.root, this.startPosition, this.startQuaternion, source, target);
      return;
    }
    applySnapFaceAlign(source.root, this.startPosition, this.startQuaternion, source, target);
  }

  /**
   * Records one pose command and one solid rebuild.
   *
   * @param root Transform root that moved.
   */
  private recordPose(root: THREE.Object3D): void {
    const command = this.poseCommand(root);
    if (!command) {
      return;
    }
    recordAlignPoseCommand(this.deps, command, [root], ALIGN_SURFACE_LOCKS);
  }

  /**
   * Builds a rotate command for the pose already applied to the root.
   *
   * @param root Transform root.
   * @returns Command, or null when the start pose is missing.
   */
  private poseCommand(root: THREE.Object3D): CommandTransformRotate | null {
    if (!this.startPosition || !this.startQuaternion) {
      return null;
    }
    const pivot = this.source?.centroid.clone() ?? new THREE.Vector3();
    return new CommandTransformRotate(
      [
        {
          object: root,
          originalPosition: this.startPosition.clone(),
          originalQuaternion: this.startQuaternion.clone(),
          finalPosition: root.position.clone(),
          finalQuaternion: root.quaternion.clone(),
        },
      ],
      pivot,
      new THREE.Vector3(0, 1, 0),
      0,
    );
  }

  /**
   * Restores the pose when the pointer is not on another object.
   *
   * @param sample Face under the pointer, or null.
   */
  private previewAlignment(sample: SnapFaceSample | null): void {
    const source = this.source;
    if (!source) {
      return;
    }
    if (!sample || sample.root === source.root) {
      this.restoreStartPose();
      return;
    }
    this.applyAlignment(source, sample);
  }

  /** Restores the source root to the pose captured at the first click. */
  private restoreStartPose(): void {
    if (!this.source || !this.startPosition || !this.startQuaternion) {
      return;
    }
    this.source.root.position.copy(this.startPosition);
    this.source.root.quaternion.copy(this.startQuaternion);
    this.source.root.updateMatrixWorld(true);
  }

  /**
   * Picks a cached face, skipping the source mesh after the first click.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param ownerDocument Document that owns the coordinates.
   * @returns Face sample, or null.
   */
  private pickSample(clientX: number, clientY: number, ownerDocument: Document | null): SnapFaceSample | null {
    const pane = resolveAlignPane(this.deps.getViewports(), clientX, clientY, ownerDocument);
    if (!pane) {
      return null;
    }
    const ray = alignPointerRay(pane.camera, pane.pickElement, clientX, clientY);
    return this.cache.pickFace(ray.origin, ray.direction, null, this.excludedIds());
  }

  /**
   * Returns roots hidden from the second pick.
   *
   * @returns Excluded ids, or an empty set before the source exists.
   */
  private excludedIds(): ReadonlySet<string> {
    if (!this.source) {
      return noExcludedRoots;
    }
    return this.excludedRootIds;
  }

  /**
   * Reports a miss when the pointer is outside every viewport.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param ownerDocument Document that owns the coordinates.
   * @returns True when a viewport contains the pointer.
   */
  private paneReady(clientX: number, clientY: number, ownerDocument: Document | null): boolean {
    const pane = resolveAlignPane(this.deps.getViewports(), clientX, clientY, ownerDocument);
    if (pane) {
      return true;
    }
    this.deps.showStatusMessage('Click in a viewport');
    return false;
  }

  /**
   * Stores a source face when the first click hit one.
   *
   * @param sample Picked face, or null.
   */
  private captureWhenPresent(sample: SnapFaceSample | null): void {
    if (!sample) {
      return;
    }
    this.captureSource(sample);
  }

  /**
   * Commits a different mesh, or asks for one.
   *
   * @param sample Picked face, or null.
   */
  private commitWhenDifferent(sample: SnapFaceSample | null): void {
    if (!sample || !this.source || sample.root === this.source.root) {
      this.rejectSameObject();
      return;
    }
    this.commitTarget(sample);
  }

  /** Restores the preview and asks for a different object. */
  private rejectSameObject(): void {
    this.restoreStartPose();
    this.deps.showStatusMessage('Pick a face on another object');
  }

  /**
   * Shows the cached face on the hover preview.
   *
   * @param sample Face under the pointer, or null.
   */
  private showHover(sample: SnapFaceSample | null): void {
    this.preview?.setHoverPick(sample ? hoverPick(sample) : null);
  }

  /** Drops the session without touching the solid. */
  private clearSession(): void {
    this.armed = false;
    this.source = null;
    this.excludedRootIds.clear();
    this.preview?.clearHover();
  }

  /** Creates the hover preview on the primary scene. */
  private ensurePreview(): void {
    if (this.preview) {
      return;
    }
    this.preview = new PreviewGridFaceAlign(this.deps.getPrimaryScene());
  }
}

/**
 * Status text for the first click.
 *
 * @param mode Session mode.
 * @returns Prompt.
 */
function sourcePrompt(mode: FaceAlignMode): string {
  if (mode === 'seat') {
    return 'Click the face to seat · Esc cancels';
  }
  return 'Click the face to orient · Esc cancels';
}

/**
 * Status text for the second click.
 *
 * @param mode Session mode.
 * @returns Prompt.
 */
function targetPrompt(mode: FaceAlignMode): string {
  if (mode === 'seat') {
    return 'Click the face to land on';
  }
  return 'Click the target face';
}

/**
 * Adapts a cached sample to the face hover highlight.
 *
 * @param sample Cached face.
 * @returns Hover pick.
 */
function hoverPick(sample: SnapFaceSample): FacePickResult {
  return {
    mesh: sample.mesh,
    faceIndex: sample.faceIndex,
    hitPoint: sample.point,
    faceNormal: sample.normal,
  };
}
