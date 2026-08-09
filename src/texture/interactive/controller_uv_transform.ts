import * as THREE from 'three';
import { CommandStack } from '@/commands/command_stack.js';
import type { FaceSelection } from '@/selection/face/manager_face_selection.js';
import type { GridSnap } from '@/transform/snap/grid_snap.js';
import { cloneFaceTextureMapping, type FaceTextureMapping } from '@/texture/uv/face_texture_mapping.js';
import { upsertFaceTextureMap } from '@/texture/uv/face_texture_storage.js';
import { bakeFaceUVs, ensureUniqueTriangleVertices } from '@/texture/uv/planar_uv_projector.js';
import { rebuildSurfaceMaterials } from '@/texture/material/builder_surface_material.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import type { UvTransformMode } from './uv_transform_mode.js';
import {
  buildUvTransformTargetsFromFaceSelection,
  type UvTransformRegionTarget,
} from './uv_transform_target_builder.js';
import { createUvTransformSession, sampleUvTransformSession, type UvTransformSession } from './uv_transform_session.js';
import type { UvTransformSnapOptions } from './math/uv_transform_snap_math.js';
import { intersectClientPointWithWorldPlane } from './math/uv_transform_plane_ray.js';
import { computeUvRadialDeadZoneRadius } from './math/uv_transform_handle_size.js';
import {
  CommandTextureUvTransform,
  restoreUvTransformSnapshot,
  type UvTransformMeshSnapshot,
} from './commands/command_texture_uv_transform.js';

/** Arguments required to begin an interactive UV transform session. */
export interface UvTransformBeginArgs {
  /** Move, rotate, or scale. */
  mode: UvTransformMode;
  /** Current face selection seeds. */
  selections: FaceSelection[];
  /** World pivot / start hit. */
  worldStart: THREE.Vector3;
  /** Unit normal of the start face plane. */
  planeNormal: THREE.Vector3;
  /** Whether snap is enabled for this session. */
  snapEnabled: boolean;
  /**
   * Optional camera used to size the rotate/scale radial dead zone. When
   * omitted, a small fixed dead zone is used.
   */
  camera?: THREE.Camera | null;
}

/**
 * Owns interactive UV transform sessions: live apply, commit undo, and cancel
 * restore.
 */
export class ControllerUvTransform {
  private commandStack: CommandStack;
  private gridSnap: GridSnap;
  private session: UvTransformSession | null;
  private beforeByMeshId: Map<string, UvTransformMeshSnapshot>;
  private touchedMeshes: Set<THREE.Mesh>;

  /**
   * Creates a UV transform controller.
   *
   * @param commandStack Undo stack for completed gestures.
   * @param gridSnap Grid snap source for session snap options.
   */
  constructor(commandStack: CommandStack, gridSnap: GridSnap) {
    this.commandStack = commandStack;
    this.gridSnap = gridSnap;
    this.session = null;
    this.beforeByMeshId = new Map();
    this.touchedMeshes = new Set();
  }

  /**
   * Returns whether a UV transform session is active.
   *
   * @returns True while a gesture is live.
   */
  isActive(): boolean {
    return this.session !== null;
  }

  /**
   * Begins a UV transform session for the given face selection.
   *
   * @param args Begin arguments.
   * @returns True when a session started.
   */
  begin(args: UvTransformBeginArgs): boolean {
    this.endWithoutCommit();
    const targets = buildUvTransformTargetsFromFaceSelection(args.selections);
    if (targets.length === 0) {
      return false;
    }
    this.session = createUvTransformSession(
      args.mode,
      targets,
      args.worldStart,
      args.planeNormal,
      this.buildSnapOptions(args.snapEnabled),
      this.resolveMinRadialStartDistance(args),
    );
    this.beforeByMeshId.clear();
    this.touchedMeshes.clear();
    this.captureBaselines(targets);
    return true;
  }

  /**
   * Updates session-local snap enabled state (Shift precision).
   *
   * @param snapEnabled Whether snap should apply to future samples.
   */
  setSnapEnabled(snapEnabled: boolean): void {
    if (!this.session) {
      return;
    }
    this.session.snap.enabled = snapEnabled;
  }

  /**
   * Samples the active session from a client pointer position.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param camera Active camera.
   * @param pickElement Pick DOM element.
   * @returns True when a sample was applied.
   */
  updateFromClientPoint(clientX: number, clientY: number, camera: THREE.Camera, pickElement: HTMLElement): boolean {
    if (!this.session) {
      return false;
    }
    const worldSample = intersectClientPointWithWorldPlane(
      clientX,
      clientY,
      camera,
      pickElement,
      this.session.dragPlane,
    );
    if (!worldSample) {
      return false;
    }
    return this.applyWorldSample(worldSample);
  }

  /**
   * Applies a known world sample (tests and alternate input paths).
   *
   * @param worldSample World point on the drag plane.
   * @returns True when applied.
   */
  applyWorldSample(worldSample: THREE.Vector3): boolean {
    if (!this.session) {
      return false;
    }
    const sample = sampleUvTransformSession(this.session, worldSample);
    this.writeSampleMappings(sample.mappings);
    return true;
  }

  /**
   * Commits the live gesture as one undoable command when anything changed.
   *
   * @returns True when a command was pushed.
   */
  end(): boolean {
    if (!this.session) {
      return false;
    }
    const beforeSnapshots = this.collectBeforeSnapshots();
    const afterSnapshots = this.collectAfterSnapshots();
    this.clearSessionState();
    if (beforeSnapshots.length === 0) {
      return false;
    }
    this.commandStack.push(new CommandTextureUvTransform(beforeSnapshots, afterSnapshots));
    return true;
  }

  /** Cancels the live gesture and restores pre-session mesh state. */
  cancel(): void {
    if (!this.session) {
      return;
    }
    this.restoreBeforeSnapshots();
    this.clearSessionState();
  }

  /**
   * Builds snap options from grid snap and a session enable flag.
   *
   * @param snapEnabled Whether snap is on for this session.
   * @returns Snap options.
   */
  private buildSnapOptions(snapEnabled: boolean): UvTransformSnapOptions {
    return {
      enabled: snapEnabled && this.gridSnap.isEnabled(),
      translationInterval: this.gridSnap.getInterval(),
      rotationSnapDegrees: this.gridSnap.getRotationSnapDegrees(),
      scaleSnapInterval: this.gridSnap.getScaleSnapInterval(),
    };
  }

  /**
   * Resolves the radial dead-zone radius for rotate/scale sessions.
   *
   * @param args Begin arguments.
   * @returns Minimum start radius, or zero for move.
   */
  private resolveMinRadialStartDistance(args: UvTransformBeginArgs): number {
    if (args.mode === 'move') {
      return 0;
    }
    if (args.camera) {
      return computeUvRadialDeadZoneRadius(args.camera, args.worldStart);
    }
    return 0.25;
  }

  /**
   * Captures before-snapshots for every mesh in the target list.
   *
   * @param targets Session targets.
   */
  private captureBaselines(targets: UvTransformRegionTarget[]): void {
    for (const target of targets) {
      if (this.beforeByMeshId.has(target.mesh.uuid)) {
        continue;
      }
      this.beforeByMeshId.set(target.mesh.uuid, CommandTextureUvTransform.captureMesh(target.mesh));
    }
  }

  /**
   * Writes live sample mappings onto each target region.
   *
   * @param mappings Per-target updated mappings.
   */
  private writeSampleMappings(mappings: FaceTextureMapping[]): void {
    if (!this.session) {
      return;
    }
    for (let index = 0; index < this.session.targets.length; index++) {
      const target = this.session.targets[index]!;
      const mapping = mappings[index];
      if (!mapping) {
        continue;
      }
      this.applyMappingToTarget(target, mapping);
    }
  }

  /**
   * Upserts, bakes, and syncs one region mapping.
   *
   * @param target Region target.
   * @param mapping Mapping to apply.
   */
  private applyMappingToTarget(target: UvTransformRegionTarget, mapping: FaceTextureMapping): void {
    ensureUniqueTriangleVertices(target.mesh);
    const live = cloneFaceTextureMapping(mapping);
    upsertFaceTextureMap(target.mesh, target.triangleIndices, live);
    bakeFaceUVs(target.mesh, target.triangleIndices, live);
    rebuildSurfaceMaterials(target.mesh, undefined, undefined, {
      preserveTriangleOrder: true,
    });
    this.syncSolidBrushIfNeeded(target.mesh, target.triangleIndices, live);
    this.touchedMeshes.add(target.mesh);
  }

  /**
   * Writes result-mesh region mapping onto solid brush faces when applicable.
   *
   * @param mesh Edited mesh.
   * @param triangleIndices Region triangles.
   * @param mapping Applied mapping.
   */
  private syncSolidBrushIfNeeded(mesh: THREE.Mesh, triangleIndices: number[], mapping: FaceTextureMapping): void {
    if (!SolidModel.isResultMesh(mesh)) {
      return;
    }
    const model = SolidModel.fromObject(mesh);
    if (!model) {
      return;
    }
    model.syncAuthoredMappingForTriangles(triangleIndices, mapping);
  }

  /**
   * Collects before snapshots for touched meshes.
   *
   * @returns Before snapshot list.
   */
  private collectBeforeSnapshots(): UvTransformMeshSnapshot[] {
    const snapshots: UvTransformMeshSnapshot[] = [];
    this.touchedMeshes.forEach((mesh) => {
      const before = this.beforeByMeshId.get(mesh.uuid);
      if (before) {
        snapshots.push(before);
      }
    });
    return snapshots;
  }

  /**
   * Captures after snapshots for touched meshes.
   *
   * @returns After snapshot list.
   */
  private collectAfterSnapshots(): UvTransformMeshSnapshot[] {
    const snapshots: UvTransformMeshSnapshot[] = [];
    this.touchedMeshes.forEach((mesh) => {
      snapshots.push(CommandTextureUvTransform.captureMesh(mesh));
    });
    return snapshots;
  }

  /** Restores every captured before snapshot. */
  private restoreBeforeSnapshots(): void {
    this.beforeByMeshId.forEach((snapshot) => {
      restoreUvTransformSnapshot(snapshot);
    });
  }

  /** Clears session bookkeeping without writing the scene. */
  private clearSessionState(): void {
    this.session = null;
    this.beforeByMeshId.clear();
    this.touchedMeshes.clear();
  }

  /** Ends without committing when replacing an active session. */
  private endWithoutCommit(): void {
    if (!this.session) {
      return;
    }
    this.restoreBeforeSnapshots();
    this.clearSessionState();
  }
}
