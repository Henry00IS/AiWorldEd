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
}
