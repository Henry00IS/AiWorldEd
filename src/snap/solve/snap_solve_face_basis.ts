import * as THREE from 'three';

/** Dot product treated as parallel unit vectors. */
const PARALLEL_DOT = 1 - 1e-8;

/**
 * World rotation that maps a source face normal onto the negated target normal.
 * The arc is the shortest one. Opposite normals produce a half-turn about the
 * source tangent. Matching normals produce identity.
 *
 * @param sourceNormal Outward source face normal.
 * @param sourceTangent Edge direction lying in the source face.
 * @param targetNormal Outward target face normal.
 * @returns World quaternion. Apply it about the source face centroid.
 */
export function snapSolveFaceBasis(
  sourceNormal: THREE.Vector3,
  sourceTangent: THREE.Vector3,
  targetNormal: THREE.Vector3,
): THREE.Quaternion {
  const desired = targetNormal.clone().normalize().negate();
  const source = sourceNormal.clone().normalize();
  const alignment = source.dot(desired);
  if (alignment >= PARALLEL_DOT) {
    return new THREE.Quaternion();
  }
  if (alignment <= -PARALLEL_DOT) {
    return halfTurnAboutSourceTangent(source, sourceTangent);
  }
  return new THREE.Quaternion().setFromUnitVectors(source, desired);
}

/**
 * Builds a half-turn about the source tangent projected into the face.
 *
 * @param sourceNormal Unit source normal.
 * @param sourceTangent Tangent hint.
 * @returns Quaternion of a half-turn.
 */
function halfTurnAboutSourceTangent(sourceNormal: THREE.Vector3, sourceTangent: THREE.Vector3): THREE.Quaternion {
  const axis = projectTangentOntoFace(sourceNormal, sourceTangent);
  return new THREE.Quaternion().setFromAxisAngle(axis, Math.PI);
}

/**
 * Projects a tangent onto the plane of a normal, or picks a stable fallback.
 *
 * @param sourceNormal Unit source normal.
 * @param sourceTangent Tangent hint.
 * @returns Unit axis lying in the face.
 */
function projectTangentOntoFace(sourceNormal: THREE.Vector3, sourceTangent: THREE.Vector3): THREE.Vector3 {
  const projected = sourceTangent.clone();
  projected.addScaledVector(sourceNormal, -sourceTangent.dot(sourceNormal));
  if (projected.lengthSq() < 1e-12) {
    return perpendicularToNormal(sourceNormal);
  }
  return projected.normalize();
}

/**
 * Returns a unit vector perpendicular to a normal.
 *
 * @param normal Unit normal.
 * @returns Unit perpendicular.
 */
function perpendicularToNormal(normal: THREE.Vector3): THREE.Vector3 {
  const helper = Math.abs(normal.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  return helper.cross(normal).normalize();
}
