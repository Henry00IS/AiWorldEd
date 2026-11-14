import * as THREE from 'three';
import type { SnapPolicy } from '@/snap/policy/snap_policy.js';

/** Inputs for one geometry snap query. */
export interface SnapQueryRequest {
  policy: SnapPolicy;
  camera: THREE.Camera;
  pointerPixels: THREE.Vector2;
  viewportWidth: number;
  viewportHeight: number;
  rayOrigin: THREE.Vector3;
  rayDirection: THREE.Vector3;
  worldRoot: THREE.Object3D;
  excludedRootIds: ReadonlySet<string>;
  excludedElementIds: ReadonlySet<string>;
  /**
   * Brush ids or mesh uuids being edited. Their faces are not targets and their
   * geometry does not hide targets, since the edited part follows the pointer.
   */
  excludedOwnerIds?: ReadonlySet<string>;
}
