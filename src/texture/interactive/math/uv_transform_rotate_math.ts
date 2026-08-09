import * as THREE from 'three';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';

/**
 * Signed angle in degrees from start to current vectors about a plane normal.
 *
 * @param fromWorld Vector from pivot to start sample.
 * @param toWorld Vector from pivot to current sample.
 * @param planeNormal Unit plane normal.
 * @returns Signed degrees in (−180, 180].
 */
export function measureSignedRotationDegrees(
  fromWorld: THREE.Vector3,
  toWorld: THREE.Vector3,
  planeNormal: THREE.Vector3,
): number {
  const from = projectOntoPlane(fromWorld, planeNormal);
  const to = projectOntoPlane(toWorld, planeNormal);
  if (from.lengthSq() < 1e-20 || to.lengthSq() < 1e-20) {
    return 0;
  }
  from.normalize();
  to.normalize();
  const cross = new THREE.Vector3().crossVectors(from, to);
  const sin = cross.dot(planeNormal);
  const cos = from.dot(to);
  return (Math.atan2(sin, cos) * 180) / Math.PI;
}

/**
 * Applies a UV rotation about a world pivot so the texture tracks the mouse
 * angle. Positions are rotated by -degrees about the pivot before projection.
 *
 * @param baseline UV matrix before rotation.
 * @param worldPivot World pivot on the face plane.
 * @param planeNormal Unit plane normal.
 * @param degrees Signed rotation degrees of the cursor.
 * @returns Updated UV matrix.
 */
export function applyUvRotateToMatrix(
  baseline: SurfaceUvMatrix,
  worldPivot: THREE.Vector3,
  planeNormal: THREE.Vector3,
  degrees: number,
): SurfaceUvMatrix {
  const matrix = buildPivotRotationMatrix(worldPivot, planeNormal, -degrees);
  return baseline.multiplyMatrix4(matrix);
}

/**
 * Builds T(pivot) * R(axis, degrees) * T(-pivot).
 *
 * @param worldPivot Rotation pivot.
 * @param planeNormal Rotation axis.
 * @param degrees Rotation degrees.
 * @returns Composite transform.
 */
function buildPivotRotationMatrix(
  worldPivot: THREE.Vector3,
  planeNormal: THREE.Vector3,
  degrees: number,
): THREE.Matrix4 {
  const axis = planeNormal.clone().normalize();
  const rotation = new THREE.Matrix4().makeRotationAxis(axis, (degrees * Math.PI) / 180);
  const toOrigin = new THREE.Matrix4().makeTranslation(-worldPivot.x, -worldPivot.y, -worldPivot.z);
  const fromOrigin = new THREE.Matrix4().makeTranslation(worldPivot.x, worldPivot.y, worldPivot.z);
  return fromOrigin.multiply(rotation).multiply(toOrigin);
}

/**
 * Removes the normal component from a world vector.
 *
 * @param worldVector Input vector.
 * @param planeNormal Unit plane normal.
 * @returns In-plane vector.
 */
function projectOntoPlane(worldVector: THREE.Vector3, planeNormal: THREE.Vector3): THREE.Vector3 {
  const normal = planeNormal.clone().normalize();
  return worldVector.clone().addScaledVector(normal, -worldVector.dot(normal));
}
