import * as THREE from 'three';
import { GizmoAxis } from '@/types/transform_mode.js';
import { BoundsFace } from '@/types/bounds_face.js';
import { GizmoHandle } from '@/transform/gizmo/gizmo_handle.js';
import { DataOrientedBounds } from '@/transform/bounds/builder_oriented_bounds.js';
import {
  captureTransformTextureState,
  type TransformTextureSnapshot,
} from '@/transform/commands/state_transform_texture.js';
import {
  contentMeshMappingsMatchCurrentUvs,
  syncContentMeshFaceMappingsToCurrentUvs,
} from '@/texture/lock/content_mesh_texture_lock.js';
import { isContentMeshEligibleForTextureLockRebake } from '@/texture/lock/texture_lock_settings.js';
import { TransformModalAxis } from '@/transform/modal/transform_modal_axis.js';

/**
 * Mutable state for one transform gizmo drag session. Shared by translate,
 * rotate, scale, and bounds drag paths.
 */
export class TransformDragSession {
  dragActive: boolean;
  activeHandle: GizmoHandle | null;
  activeAxis: GizmoAxis | null;
  dragCamera: THREE.Camera | null;
  dragRenderer: HTMLElement | null;
  initialMousePosition: THREE.Vector3 | null;
  initialRotationDirection: THREE.Vector3 | null;
  initialScreenPosition: THREE.Vector2 | null;
  useScreenSpaceRotation: boolean;
  initialPositions: Map<THREE.Object3D, THREE.Vector3>;
  initialQuaternions: Map<THREE.Object3D, THREE.Quaternion>;
  initialScales: Map<THREE.Object3D, THREE.Vector3>;
  /**
   * Texture / UV state at pointer-down so position and stretch lock can undo
   * with the pose.
   */
  initialTextureState: TransformTextureSnapshot[];
  dragDeltaAccumulator: THREE.Vector3;
  dragRotationAngle: number;
  dragScaleFactor: number;
  dragPivot: THREE.Vector3;
  initialDistanceAlongAxis: number;
  rotationPlane: THREE.Plane;
  activeBoundsFace: BoundsFace | null;
  boundsMovePlane: THREE.Plane;
  startBounds: DataOrientedBounds | null;
  boundsDeltaAlongNormal: number;
  isBoundsFaceMove: boolean;
  isBoundsResize: boolean;
  /** Screen X at bounds face pointer-down (for click vs drag). */
  pointerDownClientX: number;
  /** Screen Y at bounds face pointer-down (for click vs drag). */
  pointerDownClientY: number;
  /**
   * True once the pointer moved past the click threshold during bounds face
   * move.
   */
  boundsPointerMoved: boolean;
  /** Objects included in the current drag (for keyboard re-apply). */
  dragObjects: THREE.Object3D[];
  /** Last unconstrained pointer translation delta before modal axis lock. */
  lastPointerWorldDelta: THREE.Vector3;
  /** Last pointer-driven rotation angle in radians. */
  lastPointerRotationAngle: number;
  /** Last pointer-driven scale factor. */
  lastPointerScaleFactor: number;
  /** Last pointer-driven bounds resize delta along the face normal. */
  lastPointerBoundsResizeDelta: number;
  /** Keyboard modal axis lock mirrored for bounds drag paths. */
  modalAxisLock: TransformModalAxis;
  /**
   * True when the drag was started as a single-use keyboard tool (G/R/S style)
   * rather than a gizmo-handle or bounds-widget press.
   */
  isSingleUseDrag: boolean;
  /** True after LMB during single-use: the next pointer-up commits and exits. */
  singleUseConfirmArmed: boolean;
  /**
   * World rotation axis frozen at drag start so local-space gizmo re-frames do
   * not change the axis mid-rotate.
   */
  frozenRotationAxisWorld: THREE.Vector3 | null;
  /**
   * Signed screen angle from pivot to mouse at rotate start (Shape Editor
   * free-rotate). Used instead of raw screen deltas.
   */
  initialScreenAngleRadians: number;

  /** Creates an idle drag session with empty snapshots. */
  constructor() {
    this.dragActive = false;
    this.activeHandle = null;
    this.activeAxis = null;
    this.dragCamera = null;
    this.dragRenderer = null;
    this.initialMousePosition = null;
    this.initialRotationDirection = null;
    this.initialScreenPosition = null;
    this.useScreenSpaceRotation = false;
    this.initialPositions = new Map();
    this.initialQuaternions = new Map();
    this.initialScales = new Map();
    this.initialTextureState = [];
    this.dragDeltaAccumulator = new THREE.Vector3();
    this.dragRotationAngle = 0;
    this.dragScaleFactor = 1;
    this.dragPivot = new THREE.Vector3();
    this.initialDistanceAlongAxis = 1;
    this.rotationPlane = new THREE.Plane();
    this.activeBoundsFace = null;
    this.boundsMovePlane = new THREE.Plane();
    this.startBounds = null;
    this.boundsDeltaAlongNormal = 0;
    this.isBoundsFaceMove = false;
    this.isBoundsResize = false;
    this.pointerDownClientX = 0;
    this.pointerDownClientY = 0;
    this.boundsPointerMoved = false;
    this.dragObjects = [];
    this.lastPointerWorldDelta = new THREE.Vector3();
    this.lastPointerRotationAngle = 0;
    this.lastPointerScaleFactor = 1;
    this.lastPointerBoundsResizeDelta = 0;
    this.modalAxisLock = TransformModalAxis.None;
    this.isSingleUseDrag = false;
    this.singleUseConfirmArmed = false;
    this.frozenRotationAxisWorld = null;
    this.initialScreenAngleRadians = 0;
  }

  /**
   * Captures pre-drag transforms and texture state for every drag target. Heals
   * stale content UV matrices first so stick-mode pose changes (or DIY
   * rotations) cannot collapse a UV axis on a later world-density rebake. Solid
   * brushes are left alone. Texture state is captured only for mesh targets.
   *
   * @param selectedObjects Objects included in the drag (meshes or solid
   *   roots).
   */
  snapshotPreDragState(selectedObjects: THREE.Object3D[]): void {
    this.initialPositions.clear();
    this.initialQuaternions.clear();
    this.initialScales.clear();
    const textureMeshes: THREE.Mesh[] = [];
    selectedObjects.forEach((object) => {
      if (object instanceof THREE.Mesh) {
        this.healStaleContentUvMatrices(object);
        textureMeshes.push(object);
      }
      this.initialPositions.set(object, object.position.clone());
      this.initialQuaternions.set(object, object.quaternion.clone());
      this.initialScales.set(object, object.scale.clone());
    });
    this.initialTextureState = captureTransformTextureState(textureMeshes);
  }

  /**
   * Rewrites world UV matrices when they no longer project to current vertex
   * UVs. Safe at rest before a drag; does not modify solid brush data.
   *
   * @param mesh Candidate mesh.
   */
  private healStaleContentUvMatrices(mesh: THREE.Mesh): void {
    if (!isContentMeshEligibleForTextureLockRebake(mesh)) return;
    if (contentMeshMappingsMatchCurrentUvs(mesh)) return;
    syncContentMeshFaceMappingsToCurrentUvs(mesh);
  }

  /** Resets accumulators used while measuring drag distance and angle. */
  resetDragAccumulator(): void {
    this.dragDeltaAccumulator.set(0, 0, 0);
    this.dragRotationAngle = 0;
    this.dragScaleFactor = 1;
    this.initialDistanceAlongAxis = 1;
    this.lastPointerWorldDelta.set(0, 0, 0);
    this.lastPointerRotationAngle = 0;
    this.lastPointerScaleFactor = 1;
    this.lastPointerBoundsResizeDelta = 0;
    this.modalAxisLock = TransformModalAxis.None;
    this.isSingleUseDrag = false;
    this.singleUseConfirmArmed = false;
    this.frozenRotationAxisWorld = null;
    this.initialScreenAngleRadians = 0;
  }

  /** Clears handle, bounds, and pointer samples after pointer-up. */
  clearInteractionTargets(): void {
    this.dragActive = false;
    this.activeHandle = null;
    this.activeAxis = null;
    this.activeBoundsFace = null;
    this.startBounds = null;
    this.isBoundsFaceMove = false;
    this.isBoundsResize = false;
    this.boundsDeltaAlongNormal = 0;
    this.dragCamera = null;
    this.dragRenderer = null;
    this.initialMousePosition = null;
    this.initialRotationDirection = null;
    this.initialScreenPosition = null;
    this.useScreenSpaceRotation = false;
    this.pointerDownClientX = 0;
    this.pointerDownClientY = 0;
    this.boundsPointerMoved = false;
    this.dragObjects = [];
    this.lastPointerWorldDelta.set(0, 0, 0);
    this.lastPointerRotationAngle = 0;
    this.lastPointerScaleFactor = 1;
    this.lastPointerBoundsResizeDelta = 0;
    this.modalAxisLock = TransformModalAxis.None;
    this.isSingleUseDrag = false;
    this.singleUseConfirmArmed = false;
    this.frozenRotationAxisWorld = null;
    this.initialScreenAngleRadians = 0;
  }
}
