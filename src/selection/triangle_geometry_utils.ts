import * as THREE from 'three';

/**
 * Returns the three position-attribute vertex indices for a triangle face.
 * Correctly handles both indexed and non-indexed BufferGeometry.
 * @param geometry The buffer geometry to read.
 * @param faceIndex The triangle index (from raycast faceIndex).
 * @returns A tuple of three vertex indices into the position attribute.
 */
export function getTriangleVertexIndices(
  geometry: THREE.BufferGeometry,
  faceIndex: number
): [number, number, number] {
  const indexAttribute = geometry.index;
  if (indexAttribute) {
    const base = faceIndex * 3;
    return [
      indexAttribute.getX(base),
      indexAttribute.getX(base + 1),
      indexAttribute.getX(base + 2)
    ];
  }
  const base = faceIndex * 3;
  return [base, base + 1, base + 2];
}

/**
 * Returns the number of triangles in a buffer geometry.
 * @param geometry The geometry to inspect.
 * @returns Triangle count.
 */
export function getTriangleCount(geometry: THREE.BufferGeometry): number {
  const indexAttribute = geometry.index;
  if (indexAttribute) {
    return Math.floor(indexAttribute.count / 3);
  }
  const positions = geometry.getAttribute('position');
  if (!positions) return 0;
  return Math.floor(positions.count / 3);
}

/**
 * Reads a vertex position from a position attribute.
 * @param positions The position attribute.
 * @param vertexIndex The vertex index.
 * @returns The vertex as a Vector3.
 */
export function getVertexPosition(
  positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  vertexIndex: number
): THREE.Vector3 {
  return new THREE.Vector3(
    positions.getX(vertexIndex),
    positions.getY(vertexIndex),
    positions.getZ(vertexIndex)
  );
}

/**
 * Computes the normal of a triangle face, handling indexed geometry.
 * @param geometry The buffer geometry.
 * @param faceIndex The triangle index.
 * @returns A normalized face normal.
 */
export function computeTriangleNormal(
  geometry: THREE.BufferGeometry,
  faceIndex: number
): THREE.Vector3 {
  const positions = geometry.getAttribute('position');
  const [i0, i1, i2] = getTriangleVertexIndices(geometry, faceIndex);
  const v0 = getVertexPosition(positions, i0);
  const v1 = getVertexPosition(positions, i1);
  const v2 = getVertexPosition(positions, i2);
  const edgeA = new THREE.Vector3().subVectors(v1, v0);
  const edgeB = new THREE.Vector3().subVectors(v2, v0);
  return new THREE.Vector3().crossVectors(edgeA, edgeB).normalize();
}

/**
 * Computes a point on the triangle used as a plane sample (centroid).
 * @param geometry The buffer geometry.
 * @param faceIndex The triangle index.
 * @returns The triangle centroid.
 */
export function computeTriangleCentroid(
  geometry: THREE.BufferGeometry,
  faceIndex: number
): THREE.Vector3 {
  const positions = geometry.getAttribute('position');
  const [i0, i1, i2] = getTriangleVertexIndices(geometry, faceIndex);
  const v0 = getVertexPosition(positions, i0);
  const v1 = getVertexPosition(positions, i1);
  const v2 = getVertexPosition(positions, i2);
  return v0.add(v1).add(v2).multiplyScalar(1 / 3);
}

/**
 * Finds all triangle indices coplanar with a seed triangle.
 * Used so face selection picks whole flat faces (e.g. both tris of a box side).
 * @param geometry The buffer geometry.
 * @param seedFaceIndex The triangle that was clicked.
 * @param normalDotTolerance Minimum |n·seed| for normals to match (default ~5°).
 * @param planeTolerance Max plane distance error for coplanarity.
 * @returns Sorted unique triangle indices including the seed.
 */
export function findCoplanarFaceIndices(
  geometry: THREE.BufferGeometry,
  seedFaceIndex: number,
  normalDotTolerance: number = 0.995,
  planeTolerance: number = 1e-3
): number[] {
  const triangleCount = getTriangleCount(geometry);
  if (seedFaceIndex < 0 || seedFaceIndex >= triangleCount) {
    return [];
  }
  const seedNormal = computeTriangleNormal(geometry, seedFaceIndex);
  const seedPoint = computeTriangleCentroid(geometry, seedFaceIndex);
  const seedPlaneConstant = seedNormal.dot(seedPoint);
  const result: number[] = [];
  for (let faceIndex = 0; faceIndex < triangleCount; faceIndex++) {
    if (!isTriangleCoplanarWithSeed(
      geometry,
      faceIndex,
      seedNormal,
      seedPlaneConstant,
      normalDotTolerance,
      planeTolerance
    )) {
      continue;
    }
    result.push(faceIndex);
  }
  return result;
}

/**
 * Tests whether a triangle shares the seed face plane and normal direction.
 * @param geometry The buffer geometry.
 * @param faceIndex The triangle to test.
 * @param seedNormal The seed face normal.
 * @param seedPlaneConstant The seed plane constant (n·p).
 * @param normalDotTolerance Minimum normal alignment.
 * @param planeTolerance Max plane distance error.
 * @returns True if the triangle is coplanar with the seed.
 */
function isTriangleCoplanarWithSeed(
  geometry: THREE.BufferGeometry,
  faceIndex: number,
  seedNormal: THREE.Vector3,
  seedPlaneConstant: number,
  normalDotTolerance: number,
  planeTolerance: number
): boolean {
  const normal = computeTriangleNormal(geometry, faceIndex);
  if (Math.abs(normal.dot(seedNormal)) < normalDotTolerance) {
    return false;
  }
  const centroid = computeTriangleCentroid(geometry, faceIndex);
  const planeError = Math.abs(seedNormal.dot(centroid) - seedPlaneConstant);
  return planeError <= planeTolerance;
}

/**
 * Collects unique position-attribute indices referenced by face indices.
 * @param geometry The buffer geometry.
 * @param faceIndices The triangle indices.
 * @returns Sorted unique vertex indices.
 */
export function getUniqueVertexIndicesForFaces(
  geometry: THREE.BufferGeometry,
  faceIndices: number[]
): number[] {
  const vertexSet = new Set<number>();
  faceIndices.forEach((faceIndex) => {
    const [i0, i1, i2] = getTriangleVertexIndices(geometry, faceIndex);
    vertexSet.add(i0);
    vertexSet.add(i1);
    vertexSet.add(i2);
  });
  return Array.from(vertexSet).sort((a, b) => a - b);
}
