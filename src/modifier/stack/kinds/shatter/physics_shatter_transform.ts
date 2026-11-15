import * as THREE from 'three';

/**
 * Baked pose of one piece: x' = R·(x − c) + c + t, where c is the piece's hull
 * vertex centroid. Identity means stuck or not simulated.
 */
export interface PhysicsShatterPieceTransform {
  /** Rotation R about the centroid. */
  rotation: THREE.Quaternion;
  /** Translation t added after the rotation. */
  translation: THREE.Vector3;
}

/**
 * Returns the identity transform.
 *
 * @returns Transform that leaves a piece where it was cut.
 */
export function physicsShatterTransformIdentity(): PhysicsShatterPieceTransform {
  return { rotation: new THREE.Quaternion(), translation: new THREE.Vector3() };
}

/**
 * Builds the matrix of x' = R·(x − c) + c + t.
 *
 * @param transform Baked pose.
 * @param centroid Hull vertex centroid c.
 * @returns Frame-space matrix moving the piece to its baked pose.
 */
export function physicsShatterTransformMatrix(
  transform: PhysicsShatterPieceTransform,
  centroid: THREE.Vector3,
): THREE.Matrix4 {
  const rotation = new THREE.Matrix4().makeRotationFromQuaternion(transform.rotation.clone().normalize());
  const toOrigin = new THREE.Matrix4().makeTranslation(-centroid.x, -centroid.y, -centroid.z);
  const back = centroid.clone().add(transform.translation);
  return new THREE.Matrix4().makeTranslation(back.x, back.y, back.z).multiply(rotation).multiply(toOrigin);
}

/**
 * Returns whether a transform leaves its piece in place.
 *
 * @param transform Baked pose.
 * @returns True for identity within a micrometre and a microradian.
 */
export function physicsShatterTransformIsIdentity(transform: PhysicsShatterPieceTransform): boolean {
  const turned = 1 - Math.abs(transform.rotation.clone().normalize().w) > 1e-12;
  return !turned && transform.translation.lengthSq() < 1e-12;
}
