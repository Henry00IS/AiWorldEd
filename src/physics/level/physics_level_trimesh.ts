import * as THREE from 'three';

/** Squared triangle area threshold below which a triangle is dropped. */
const PHYSICS_LEVEL_TRIMESH_MIN_DOUBLE_AREA_SQUARED = 1e-14;

/** Vertex and index buffers ready for a Rapier triangle mesh collider. */
export interface PhysicsLevelTrimeshBuffers {
  vertices: Float32Array;
  indices: Uint32Array;
  triangleCount: number;
}

const scratchCornerA = new THREE.Vector3();
const scratchCornerB = new THREE.Vector3();
const scratchCornerC = new THREE.Vector3();
const scratchEdgeAB = new THREE.Vector3();
const scratchEdgeAC = new THREE.Vector3();

/**
 * Builds trimesh buffers from a non-indexed triangle position list, dropping
 * non-finite and degenerate (zero area) triangles.
 *
 * @param trianglePositions Flat xyz positions, three vertices per triangle.
 * @param bakeMatrix Optional matrix applied to every vertex (for scale).
 * @returns Buffers, or null when no usable triangle remains.
 */
export function physicsLevelTrimeshBuild(
  trianglePositions: ArrayLike<number>,
  bakeMatrix: THREE.Matrix4 | null = null,
): PhysicsLevelTrimeshBuffers | null {
  const sourceTriangleCount = Math.floor(trianglePositions.length / 9);
  const vertices = new Float32Array(sourceTriangleCount * 9);
  let keptTriangleCount = 0;
  for (let triangleIndex = 0; triangleIndex < sourceTriangleCount; triangleIndex++) {
    if (!physicsLevelTrimeshReadTriangle(trianglePositions, triangleIndex, bakeMatrix)) {
      continue;
    }
    physicsLevelTrimeshWriteTriangle(vertices, keptTriangleCount);
    keptTriangleCount++;
  }
  if (keptTriangleCount === 0) {
    return null;
  }
  return physicsLevelTrimeshFinish(vertices, keptTriangleCount);
}

/**
 * Wraps kept vertices with a sequential index buffer.
 *
 * @param vertices Vertex buffer with kept triangles at the front.
 * @param triangleCount Number of kept triangles.
 * @returns Final buffers trimmed to the kept triangles.
 */
function physicsLevelTrimeshFinish(vertices: Float32Array, triangleCount: number): PhysicsLevelTrimeshBuffers {
  const indices = new Uint32Array(triangleCount * 3);
  for (let index = 0; index < indices.length; index++) {
    indices[index] = index;
  }
  return { vertices: vertices.slice(0, triangleCount * 9), indices, triangleCount };
}

/**
 * Loads one triangle into the scratch corners and validates it.
 *
 * @param trianglePositions Flat xyz positions.
 * @param triangleIndex Triangle to read.
 * @param bakeMatrix Optional vertex transform.
 * @returns True when the triangle is finite and not degenerate.
 */
function physicsLevelTrimeshReadTriangle(
  trianglePositions: ArrayLike<number>,
  triangleIndex: number,
  bakeMatrix: THREE.Matrix4 | null,
): boolean {
  const base = triangleIndex * 9;
  physicsLevelTrimeshReadCorner(trianglePositions, base, bakeMatrix, scratchCornerA);
  physicsLevelTrimeshReadCorner(trianglePositions, base + 3, bakeMatrix, scratchCornerB);
  physicsLevelTrimeshReadCorner(trianglePositions, base + 6, bakeMatrix, scratchCornerC);
  if (!physicsLevelTrimeshCornersFinite()) {
    return false;
  }
  scratchEdgeAB.subVectors(scratchCornerB, scratchCornerA);
  scratchEdgeAC.subVectors(scratchCornerC, scratchCornerA);
  return scratchEdgeAB.cross(scratchEdgeAC).lengthSq() > PHYSICS_LEVEL_TRIMESH_MIN_DOUBLE_AREA_SQUARED;
}

/**
 * Reads one corner and applies the optional bake matrix.
 *
 * @param trianglePositions Flat xyz positions.
 * @param offset Float offset of the corner.
 * @param bakeMatrix Optional vertex transform.
 * @param target Destination corner.
 */
function physicsLevelTrimeshReadCorner(
  trianglePositions: ArrayLike<number>,
  offset: number,
  bakeMatrix: THREE.Matrix4 | null,
  target: THREE.Vector3,
): void {
  target.set(
    trianglePositions[offset] ?? NaN,
    trianglePositions[offset + 1] ?? NaN,
    trianglePositions[offset + 2] ?? NaN,
  );
  if (bakeMatrix) {
    target.applyMatrix4(bakeMatrix);
  }
}

/**
 * Returns whether every scratch corner coordinate is finite.
 *
 * @returns True when all nine coordinates are finite numbers.
 */
function physicsLevelTrimeshCornersFinite(): boolean {
  return (
    Number.isFinite(scratchCornerA.x + scratchCornerA.y + scratchCornerA.z) &&
    Number.isFinite(scratchCornerB.x + scratchCornerB.y + scratchCornerB.z) &&
    Number.isFinite(scratchCornerC.x + scratchCornerC.y + scratchCornerC.z)
  );
}

/**
 * Writes the scratch corners as kept triangle number keptIndex.
 *
 * @param vertices Destination vertex buffer.
 * @param keptIndex Kept triangle slot.
 */
function physicsLevelTrimeshWriteTriangle(vertices: Float32Array, keptIndex: number): void {
  const base = keptIndex * 9;
  vertices[base] = scratchCornerA.x;
  vertices[base + 1] = scratchCornerA.y;
  vertices[base + 2] = scratchCornerA.z;
  vertices[base + 3] = scratchCornerB.x;
  vertices[base + 4] = scratchCornerB.y;
  vertices[base + 5] = scratchCornerB.z;
  vertices[base + 6] = scratchCornerC.x;
  vertices[base + 7] = scratchCornerC.y;
  vertices[base + 8] = scratchCornerC.z;
}

/**
 * Expands a buffer geometry (indexed or not) into a flat non-indexed triangle
 * position list in the geometry's local space.
 *
 * @param geometry Source geometry with a position attribute.
 * @returns Flat xyz positions, three vertices per triangle.
 */
export function physicsLevelTrimeshExpandGeometry(geometry: THREE.BufferGeometry): Float32Array {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const cornerCount = index ? index.count : position.count;
  const usableCornerCount = cornerCount - (cornerCount % 3);
  const output = new Float32Array(usableCornerCount * 3);
  for (let corner = 0; corner < usableCornerCount; corner++) {
    const vertexIndex = index ? index.getX(corner) : corner;
    output[corner * 3] = position.getX(vertexIndex);
    output[corner * 3 + 1] = position.getY(vertexIndex);
    output[corner * 3 + 2] = position.getZ(vertexIndex);
  }
  return output;
}
