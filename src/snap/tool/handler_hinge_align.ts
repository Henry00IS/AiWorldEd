import * as THREE from 'three';
import type { SnapHit } from '@/snap/hit/snap_hit.js';
import { snapHingeRotatePoint } from '@/snap/solve/snap_hinge_rotation.js';
import { snapSolveHingeAngle } from '@/snap/solve/snap_solve_hinge_angle.js';
import { clientPointToElementPixels, elementPixelSize } from '@/snap/session/snap_source_lock.js';
import { CommandTransformHingePose } from '@/transform/commands/command_transform_hinge_pose.js';
import { PickerGridEdgeAlign, type GridEdgePickResult } from '@/tools/grid/picker_grid_edge_align.js';
import { recordAlignPoseCommand } from './snap_align_pose_command.js';
import type { SnapAlignCache } from './snap_align_cache.js';
import type { SnapAlignHost } from './snap_align_host.js';
import { alignPointerRay } from './snap_align_pointer_ray.js';
import { resolveAlignPane } from './snap_align_pane.js';
import { snapHingeEdgeRoot } from './snap_hinge_edge_root.js';
import { createHingeSnapPolicy } from './snap_hinge_policy.js';
import { applySnapHingeRotation } from './snap_hinge_rotation_apply.js';
import { ALIGN_SURFACE_LOCKS } from './snap_align_surface_locks.js';
import { PreviewSnapAlignEdge } from './preview_snap_align_edge.js';

/** Start pose of one rotating root. */
interface HingePose {
  root: THREE.Object3D;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
}

/**
 * Rotates around a picked hinge until a second edge on that object meets a
 * target edge. The motion is rotation only, and brush face UV matrices stay
 * with the brush. A compiled solid edge moves the brush that owns it. The
 * second edge may lie on that same brush or on the combined selection.
 */
export class HandlerHingeAlign {
  private readonly deps: SnapAlignHost;
  private readonly cache: SnapAlignCache;
  private readonly picker: PickerGridEdgeAlign;
  private armed: boolean;
  private hinge: GridEdgePickResult | null;
  private poses: HingePose[];
  private riderPoint: THREE.Vector3 | null;
  private riderStart: THREE.Vector3 | null;
  private riderEnd: THREE.Vector3 | null;
  private pointerZero: number;
  private readonly excludedRootIds: Set<string>;
  private edgePreview: PreviewSnapAlignEdge | null;
  private riderPreview: PreviewSnapAlignEdge | null;

  /**
   * Creates a hinge align handler.
   *
   * @param deps Scene, selection, undo, and solid refresh.
   * @param cache Targets captured when the tool armed.
   */
  constructor(deps: SnapAlignHost, cache: SnapAlignCache) {
    this.deps = deps;
    this.cache = cache;
    this.picker = new PickerGridEdgeAlign();
    this.armed = false;
    this.hinge = null;
    this.poses = [];
    this.riderPoint = null;
    this.riderStart = null;
    this.riderEnd = null;
    this.pointerZero = 0;
    this.excludedRootIds = new Set();
    this.edgePreview = null;
    this.riderPreview = null;
  }

  /**
   * Returns whether the tool is waiting for input.
   *
   * @returns True while armed.
   */
  isArmed(): boolean {
    return this.armed;
  }

  /** Arms the tool and asks for the hinge edge. */
  arm(): void {
    this.cancel();
    this.armed = true;
    this.deps.showStatusMessage('Click the hinge edge · Esc cancels');
  }

  /**
   * Restores start poses and leaves the tool.
   *
   * @returns True when a session was cancelled.
   */
  cancel(): boolean {
    const wasArmed = this.armed || this.hinge !== null;
    this.restorePoses();
    this.armed = false;
    this.hinge = null;
    this.poses = [];
    this.riderPoint = null;
    this.riderStart = null;
    this.riderEnd = null;
    this.pointerZero = 0;
    this.excludedRootIds.clear();
    this.edgePreview?.clear();
    this.riderPreview?.clear();
    return wasArmed;
  }

  /**
   * Previews the rotation while a hinge is set.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param ownerDocument Document that owns the coordinates.
   */
  updateHover(clientX: number, clientY: number, ownerDocument: Document | null): void {
    if (!this.armed) {
      return;
    }
    const pane = resolveAlignPane(this.deps.getViewports(), clientX, clientY, ownerDocument);
    if (!pane) {
      return;
    }
    if (!this.hinge) {
      this.previewHoveredEdge(pane.camera, pane.pickElement, clientX, clientY);
      return;
    }
    this.showLockedEdge();
    if (!this.riderPoint) {
      this.previewRiderCandidate(pane.camera, pane.pickElement, clientX, clientY);
      return;
    }
    this.previewAt(pane.camera, pane.pickElement, clientX, clientY);
  }

  /**
   * Picks the hinge, or commits the preview when the hinge is already set.
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
    const pane = resolveAlignPane(this.deps.getViewports(), clientX, clientY, ownerDocument);
    if (!pane) {
      this.deps.showStatusMessage('Click in a viewport');
      return true;
    }
    if (!this.hinge) {
      this.captureHinge(pane.camera, pane.pickElement, clientX, clientY);
      return true;
    }
    if (!this.riderPoint) {
      this.captureRider(pane.camera, pane.pickElement, clientX, clientY);
      return true;
    }
    this.previewAt(pane.camera, pane.pickElement, clientX, clientY);
    this.commit();
    return true;
  }

  /**
   * Stores the hinge edge and the roots that will rotate.
   *
   * @param camera Camera.
   * @param pickElement Viewport element.
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   */
  private captureHinge(camera: THREE.Camera, pickElement: HTMLElement, clientX: number, clientY: number): void {
    const edge = this.picker.pickEdge(pointerEvent(clientX, clientY), camera, pickElement, this.deps.worldObject);
    if (!edge?.mesh) {
      this.deps.showStatusMessage('Click an edge');
      return;
    }
    const roots = rootsToRotate(edge, this.deps.getSelectedRoots());
    this.hinge = edge;
    this.poses = captureHingePoses(roots);
    this.rememberExcluded();
    this.showLockedEdge();
    this.deps.showStatusMessage('Click the edge that should meet the target · Esc cancels');
  }

  /**
   * Stores the edge that will swing onto the target.
   *
   * @param camera Camera.
   * @param pickElement Viewport element.
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   */
  private captureRider(camera: THREE.Camera, pickElement: HTMLElement, clientX: number, clientY: number): void {
    const hinge = this.hinge;
    if (!hinge) {
      return;
    }
    const edge = this.picker.pickEdge(pointerEvent(clientX, clientY), camera, pickElement, this.deps.worldObject);
    if (!this.riderEdgeAccepted(hinge, edge)) {
      return;
    }
    const rider = riderPointForEdge(hinge, edge);
    if (!rider) {
      this.deps.showStatusMessage('Click the other edge that should meet the target');
      return;
    }
    this.riderPoint = rider;
    this.riderStart = edge.pointA.clone();
    this.riderEnd = edge.pointB.clone();
    this.pointerZero = pointerAngleAboutHinge(hinge, camera, pickElement, clientX, clientY);
    this.showRiderEdge(0);
    this.deps.showStatusMessage('Move onto the target edge, then click');
  }

  /**
   * Applies the snapped or pointer angle from the start poses.
   *
   * @param camera Camera.
   * @param pickElement Viewport element.
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   */
  private previewAt(camera: THREE.Camera, pickElement: HTMLElement, clientX: number, clientY: number): void {
    const hinge = this.hinge;
    const rider = this.riderPoint;
    if (!hinge || !rider || !this.riderStart || !this.riderEnd) {
      return;
    }
    const hit = this.queryAt(camera, pickElement, clientX, clientY);
    const unsnapped = pointerAngleAboutHinge(hinge, camera, pickElement, clientX, clientY) - this.pointerZero;
    const angle = solvedAngle(hinge, rider, hit, unsnapped);
    this.applyMotion(angle);
    this.showRiderEdge(angle);
  }

  /**
   * Queries a snap hit, excluding the rotating roots.
   *
   * @param camera Camera.
   * @param pickElement Viewport element.
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @returns Hit, or null.
   */
  private queryAt(camera: THREE.Camera, pickElement: HTMLElement, clientX: number, clientY: number): SnapHit | null {
    const pointer = clientPointToElementPixels(pickElement, clientX, clientY);
    const size = elementPixelSize(pickElement);
    const ray = alignPointerRay(camera, pickElement, clientX, clientY);
    return this.cache.queryPreferringVertex({
      policy: createHingeSnapPolicy(),
      camera,
      pointerPixels: pointer,
      viewportWidth: size.x,
      viewportHeight: size.y,
      rayOrigin: ray.origin,
      rayDirection: ray.direction,
      worldRoot: this.deps.worldObject,
      excludedRootIds: this.excludedRootIds,
      excludedElementIds: new Set(),
    });
  }

  /**
   * Writes the hinge rotation onto every captured root.
   *
   * @param angle Signed angle in radians from the start pose.
   */
  private applyMotion(angle: number): void {
    const hinge = this.hinge;
    if (!hinge) {
      return;
    }
    for (const pose of this.poses) {
      applyPoseHingeRotation(pose, hinge, angle);
    }
  }

  /** Records one pose command and leaves the tool without restoring. */
  private commit(): void {
    const roots = this.poses.map((pose) => pose.root);
    this.recordPose(roots);
    this.deps.showStatusMessage('Hinge aligned');
    this.edgePreview?.clear();
    this.riderPreview?.clear();
    this.armed = false;
    this.hinge = null;
    this.poses = [];
  }

  /**
   * Records the hinge pose and one solid rebuild.
   *
   * @param roots Roots that moved.
   */
  private recordPose(roots: readonly THREE.Object3D[]): void {
    const hinge = this.hinge;
    if (!hinge) {
      return;
    }
    const command = new CommandTransformHingePose(this.hingePoseSnapshots());
    recordAlignPoseCommand(this.deps, command, roots, ALIGN_SURFACE_LOCKS);
  }

  /**
   * Draws the outline edge currently under the pointer.
   *
   * @param camera Camera.
   * @param pickElement Viewport element.
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   */
  private previewHoveredEdge(camera: THREE.Camera, pickElement: HTMLElement, clientX: number, clientY: number): void {
    const edge = this.picker.pickEdge(pointerEvent(clientX, clientY), camera, pickElement, this.deps.worldObject);
    if (!edge) {
      this.edgePreview?.clear();
      return;
    }
    this.ensureEdgePreview().setSegment(edge.pointA, edge.pointB);
  }

  /** Draws the hinge edge that was clicked. */
  private showLockedEdge(): void {
    const hinge = this.hinge;
    if (!hinge) {
      return;
    }
    this.ensureEdgePreview().setSegment(hinge.pointA, hinge.pointB);
  }

  /**
   * Highlights a second edge when it belongs to the rotating object.
   *
   * @param camera Camera.
   * @param pickElement Viewport element.
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   */
  private previewRiderCandidate(
    camera: THREE.Camera,
    pickElement: HTMLElement,
    clientX: number,
    clientY: number,
  ): void {
    const hinge = this.hinge;
    const edge = this.picker.pickEdge(pointerEvent(clientX, clientY), camera, pickElement, this.deps.worldObject);
    if (!hinge || !edge?.mesh || !edgeSharesRotation(edge, this.poses) || edgesMatch(edge, hinge)) {
      this.riderPreview?.clear();
      return;
    }
    this.ensureRiderPreview().setSegment(edge.pointA, edge.pointB);
  }

  /**
   * Draws the chosen edge after the hinge rotation.
   *
   * @param angle Signed angle in radians from the pose where the edge was
   *   picked.
   */
  private showRiderEdge(angle: number): void {
    const hinge = this.hinge;
    const start = this.riderStart;
    const end = this.riderEnd;
    if (!hinge || !start || !end) {
      return;
    }
    this.ensureRiderPreview().setSegment(
      snapHingeRotatePoint(start, hinge.pointA, hinge.direction, angle),
      snapHingeRotatePoint(end, hinge.pointA, hinge.direction, angle),
    );
  }

  /**
   * Rejects a second edge that is missing, on another object, or on the hinge.
   *
   * @param hinge Hinge edge.
   * @param edge Picked edge, or null.
   * @returns True when the edge can swing onto a target.
   */
  private riderEdgeAccepted(hinge: GridEdgePickResult, edge: GridEdgePickResult | null): edge is GridEdgePickResult {
    if (!edge?.mesh || !edgeSharesRotation(edge, this.poses)) {
      this.deps.showStatusMessage('Click an edge on this object');
      return false;
    }
    if (edgesMatch(edge, hinge) || edgeLiesOnHinge(edge, hinge)) {
      this.deps.showStatusMessage('Click the other edge that should meet the target');
      return false;
    }
    return true;
  }

  /**
   * Creates the edge overlay on the primary scene.
   *
   * @returns Edge overlay.
   */
  private ensureEdgePreview(): PreviewSnapAlignEdge {
    if (this.edgePreview) {
      return this.edgePreview;
    }
    const preview = new PreviewSnapAlignEdge(this.deps.getPrimaryScene());
    this.edgePreview = preview;
    return preview;
  }

  /**
   * Creates the overlay for the edge that meets the target.
   *
   * @returns Rider overlay.
   */
  private ensureRiderPreview(): PreviewSnapAlignEdge {
    if (this.riderPreview) {
      return this.riderPreview;
    }
    const preview = new PreviewSnapAlignEdge(this.deps.getPrimaryScene(), 'preview_snap_align_rider');
    this.riderPreview = preview;
    return preview;
  }

  /** Hides the rotating roots from later snap queries. */
  private rememberExcluded(): void {
    for (const pose of this.poses) {
      addTreeIds(pose.root, this.excludedRootIds);
    }
  }

  /**
   * Copies the captured poses into undo snapshots.
   *
   * @returns Snapshots of the start and current poses.
   */
  private hingePoseSnapshots() {
    return this.poses.map((pose) => ({
      object: pose.root,
      originalPosition: pose.position.clone(),
      originalQuaternion: pose.quaternion.clone(),
      originalScale: pose.scale.clone(),
      finalPosition: pose.root.position.clone(),
      finalQuaternion: pose.root.quaternion.clone(),
      finalScale: pose.root.scale.clone(),
    }));
  }

  /** Restores every captured root. */
  private restorePoses(): void {
    for (const pose of this.poses) {
      restoreHingePose(pose);
    }
  }
}

/**
 * Adds an object and every descendant to an id set.
 *
 * @param object Scene object.
 * @param ids Output ids.
 */
function addTreeIds(object: THREE.Object3D, ids: Set<string>): void {
  ids.add(object.uuid);
  object.traverse((child) => {
    ids.add(child.uuid);
  });
}

/**
 * Builds a mouse event for the edge picker.
 *
 * @param clientX Pointer client X.
 * @param clientY Pointer client Y.
 * @returns Mouse event.
 */
function pointerEvent(clientX: number, clientY: number): MouseEvent {
  return new MouseEvent('mousedown', { clientX, clientY, bubbles: true });
}

/**
 * Chooses the roots that rotate around the hinge. A solid edge uses the brush
 * that owns it. The whole selection moves only when that brush is selected.
 *
 * @param edge Hinge edge.
 * @param selected Currently selected transform roots.
 * @returns Roots to rotate.
 */
function rootsToRotate(edge: GridEdgePickResult, selected: readonly THREE.Object3D[]): THREE.Object3D[] {
  const mesh = edge.mesh;
  if (!mesh) {
    return [];
  }
  const hingeRoot = snapHingeEdgeRoot(mesh, edge.pointA, edge.pointB);
  if (selected.some((root) => root === hingeRoot)) {
    return [...selected];
  }
  return [hingeRoot];
}

/**
 * Returns whether an edge belongs to a root that this hinge moves.
 *
 * @param edge Candidate edge.
 * @param poses Roots that rotate.
 * @returns True when the edge may be the one that meets the target.
 */
function edgeSharesRotation(edge: GridEdgePickResult, poses: readonly HingePose[]): boolean {
  const mesh = edge.mesh;
  if (!mesh) {
    return false;
  }
  const root = snapHingeEdgeRoot(mesh, edge.pointA, edge.pointB);
  return poses.some((pose) => pose.root === root);
}

/**
 * Returns whether two picks are the same edge.
 *
 * @param first First edge.
 * @param second Second edge.
 * @returns True when the endpoints match.
 */
function edgesMatch(first: GridEdgePickResult, second: GridEdgePickResult): boolean {
  const direct =
    first.pointA.distanceToSquared(second.pointA) < 1e-8 && first.pointB.distanceToSquared(second.pointB) < 1e-8;
  const flipped =
    first.pointA.distanceToSquared(second.pointB) < 1e-8 && first.pointB.distanceToSquared(second.pointA) < 1e-8;
  return direct || flipped;
}

/**
 * Returns whether both endpoints already lie on the hinge line.
 *
 * @param edge Candidate edge.
 * @param hinge Hinge edge.
 * @returns True when the edge cannot swing.
 */
function edgeLiesOnHinge(edge: GridEdgePickResult, hinge: GridEdgePickResult): boolean {
  const direction = hinge.direction.clone().normalize();
  return (
    distanceToHinge(edge.pointA, hinge.pointA, direction) < 1e-4 &&
    distanceToHinge(edge.pointB, hinge.pointA, direction) < 1e-4
  );
}

/**
 * Picks a point on an edge that orbits the hinge.
 *
 * @param hinge Hinge edge.
 * @param edge Edge that should meet the target.
 * @returns World point, or null when the edge lies on the hinge.
 */
function riderPointForEdge(hinge: GridEdgePickResult, edge: GridEdgePickResult): THREE.Vector3 | null {
  const direction = hinge.direction.clone().normalize();
  const midpoint = edge.pointA.clone().add(edge.pointB).multiplyScalar(0.5);
  if (distanceToHinge(midpoint, hinge.pointA, direction) > 1e-4) {
    return midpoint;
  }
  const distanceA = distanceToHinge(edge.pointA, hinge.pointA, direction);
  const distanceB = distanceToHinge(edge.pointB, hinge.pointA, direction);
  if (distanceA <= 1e-4 && distanceB <= 1e-4) {
    return null;
  }
  return distanceA >= distanceB ? edge.pointA.clone() : edge.pointB.clone();
}

/**
 * Distance from a point to a hinge line.
 *
 * @param point World point.
 * @param hingePoint Point on the hinge.
 * @param direction Unit hinge direction.
 * @returns Distance.
 */
function distanceToHinge(point: THREE.Vector3, hingePoint: THREE.Vector3, direction: THREE.Vector3): number {
  const offset = point.clone().sub(hingePoint);
  return offset.sub(direction.clone().multiplyScalar(offset.dot(direction))).length();
}

/**
 * Pointer angle around the hinge from the hinge midpoint.
 *
 * @param edge Hinge edge.
 * @param camera Camera.
 * @param pickElement Viewport element.
 * @param clientX Pointer client X.
 * @param clientY Pointer client Y.
 * @returns Signed angle, or 0 when the ray misses the plane.
 */
function pointerAngleAboutHinge(
  edge: GridEdgePickResult,
  camera: THREE.Camera,
  pickElement: HTMLElement,
  clientX: number,
  clientY: number,
): number {
  const pointer = clientPointToElementPixels(pickElement, clientX, clientY);
  const size = elementPixelSize(pickElement);
  const ndc = new THREE.Vector2((pointer.x / size.x) * 2 - 1, -(pointer.y / size.y) * 2 + 1);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(ndc, camera);
  const direction = edge.direction.clone().normalize();
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(direction, edge.pointA);
  const hit = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
  if (!hit) {
    return 0;
  }
  const radial = hit.sub(edge.pointA);
  const planar = radial.sub(direction.clone().multiplyScalar(radial.dot(direction)));
  if (planar.lengthSq() < 1e-8) {
    return 0;
  }
  const xAxis = new THREE.Vector3(1, 0, 0);
  if (Math.abs(direction.dot(xAxis)) > 0.9) {
    xAxis.set(0, 1, 0);
  }
  const tangent = direction.clone().cross(xAxis).normalize();
  const bitangent = direction.clone().cross(tangent).normalize();
  return Math.atan2(planar.dot(bitangent), planar.dot(tangent));
}

/**
 * Captures the start pose of every root that will move.
 *
 * @param roots Roots that rotate about the hinge.
 * @returns Start poses.
 */
function captureHingePoses(roots: readonly THREE.Object3D[]): HingePose[] {
  return roots.map((root) => ({
    root,
    position: root.position.clone(),
    quaternion: root.quaternion.clone(),
    scale: root.scale.clone(),
  }));
}

/**
 * Writes one root's hinge rotation from its start pose.
 *
 * @param pose Start pose.
 * @param hinge Hinge edge.
 * @param angle Signed angle in radians.
 */
function applyPoseHingeRotation(pose: HingePose, hinge: GridEdgePickResult, angle: number): void {
  applySnapHingeRotation(pose.root, pose.position, pose.quaternion, pose.scale, hinge.pointA, hinge.direction, angle);
}

/**
 * Restores one captured root.
 *
 * @param pose Start pose.
 */
function restoreHingePose(pose: HingePose): void {
  pose.root.position.copy(pose.position);
  pose.root.quaternion.copy(pose.quaternion);
  pose.root.scale.copy(pose.scale);
  pose.root.updateMatrixWorld(true);
}

/**
 * Uses the circle solver when a hit exists. The chosen edge swings toward the
 * hit.
 *
 * @param edge Hinge edge.
 * @param rider Point on the edge that should meet the target.
 * @param hit Snap hit, or null.
 * @param unsnappedAngle Pointer angle.
 * @returns Angle to apply.
 */
function solvedAngle(
  edge: GridEdgePickResult,
  rider: THREE.Vector3,
  hit: SnapHit | null,
  unsnappedAngle: number,
): number {
  if (!hit) {
    return unsnappedAngle;
  }
  const angle = snapSolveHingeAngle({
    hingePoint: edge.pointA,
    hingeDirection: edge.direction,
    riderPoint: rider,
    faceNormal: null,
    hit,
    unsnappedAngle,
  });
  if (angle === null) {
    return unsnappedAngle;
  }
  return angle;
}
