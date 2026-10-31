import * as THREE from 'three';
import { snapHingeRotationQuaternion } from '@/snap/solve/snap_hinge_rotation.js';
import { applyWorldPivotRotation } from '@/transform/core/transform_world_pose.js';

/**
 * Rotates an object about a world hinge from its start pose. Scale is copied
 * from the start pose and is not changed.
 *
 * @param root Object to rotate.
 * @param startPosition Local position before the operation.
 * @param startQuaternion Local quaternion before the operation.
 * @param startScale Local scale before the operation.
 * @param hingePoint World point on the hinge.
 * @param hingeDirection World hinge direction.
 * @param angle Signed angle in radians from the start pose.
 */
export function applySnapHingeRotation(
  root: THREE.Object3D,
  startPosition: THREE.Vector3,
  startQuaternion: THREE.Quaternion,
  startScale: THREE.Vector3,
  hingePoint: THREE.Vector3,
  hingeDirection: THREE.Vector3,
  angle: number,
): void {
  root.scale.copy(startScale);
  applyWorldPivotRotation(
    root,
    startPosition,
    startQuaternion,
    hingePoint,
    snapHingeRotationQuaternion(hingeDirection, angle),
    new THREE.Vector3(),
  );
}
