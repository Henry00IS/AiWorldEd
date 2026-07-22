import * as THREE from 'three';
import { GizmoAxis } from '../types/transform_mode.js';
import { BoundsFace } from '../types/bounds_face.js';
import { GizmoHandle } from './gizmo_handle.js';
import { OrientedBoundsData } from './oriented_bounds.js';

/**
 * Mutable state for one transform gizmo drag session.
 * Shared by translate, rotate, scale, and bounds drag paths.
 */
export class TransformDragSession {
  dragActive: boolean;
  activeHandle: GizmoHandle | null;
  activeAxis: GizmoAxis | null;
  dragCamera: THREE.Camera | null;
  dragRenderer: THREE.WebGLRenderer | null;
  initialMousePosition: THREE.Vector3 | null;
  initialRotationDirection: THREE.Vector3 | null;
  initialScreenPosition: THREE.Vector2 | null;
  useScreenSpaceRotation: boolean;
  initialPositions: Map<THREE.Mesh, THREE.Vector3>;
  initialQuaternions: Map<THREE.Mesh, THREE.Quaternion>;
  initialScales: Map<THREE.Mesh, THREE.Vector3>;
  dragDeltaAccumulator: THREE.Vector3;
  dragRotationAngle: number;
  dragScaleFactor: number;
  dragPivot: THREE.Vector3;
  initialDistanceAlongAxis: number;
  rotationPlane: THREE.Plane;
  activeBoundsFace: BoundsFace | null;
  boundsMovePlane: THREE.Plane;
  startBounds: OrientedBoundsData | null;
  boundsDeltaAlongNormal: number;
  isBoundsFaceMove: boolean;
  isBoundsResize: boolean;

  /**
   * Creates an idle drag session with empty snapshots.
   */
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
  }

  /**
   * Captures pre-drag transforms for every selected mesh.
   * @param selectedObjects Meshes included in the drag.
   */
  snapshotPreDragState(selectedObjects: THREE.Mesh[]): void {
    this.initialPositions.clear();
    this.initialQuaternions.clear();
    this.initialScales.clear();
    selectedObjects.forEach((mesh) => {
      this.initialPositions.set(mesh, mesh.position.clone());
      this.initialQuaternions.set(mesh, mesh.quaternion.clone());
      this.initialScales.set(mesh, mesh.scale.clone());
    });
  }

  /**
   * Resets accumulators used while measuring drag distance and angle.
   */
  resetDragAccumulator(): void {
    this.dragDeltaAccumulator.set(0, 0, 0);
    this.dragRotationAngle = 0;
    this.dragScaleFactor = 1;
    this.initialDistanceAlongAxis = 1;
  }

  /**
   * Clears handle, bounds, and pointer samples after pointer-up.
   */
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
  }
}
