import * as THREE from 'three';
import {
  computeTriangleNormal,
  getTriangleVertexIndices,
  getUniqueVertexIndicesForFaces as collectUniqueVertices,
  getVertexPosition
} from '../selection/triangle_geometry_utils.js';

/**
 * Helper geometry utilities retained for tests and average-normal math.
 * Real editor extrusion lives in convex_face_prism.ts and creates a new solid.
 */

/**
 * Computes the normal vector of a single triangle face.
 * @param geometry The buffer geometry containing vertex positions.
 * @param faceIndex The triangle index to compute the normal for.
 * @returns The normalized face normal vector.
 */
export function computeFaceNormal(
  geometry: THREE.BufferGeometry,
  faceIndex: number
): THREE.Vector3 {
  return computeTriangleNormal(geometry, faceIndex);
}

/**
 * Computes the average normal across multiple face indices.
 * @param geometry The buffer geometry containing vertex positions.
 * @param faceIndices The array of triangle indices to average.
 * @returns The normalized average normal vector.
 */
export function computeAverageNormals(
  geometry: THREE.BufferGeometry,
  faceIndices: number[]
): THREE.Vector3 {
  const accumulator = new THREE.Vector3();
  faceIndices.forEach((faceIndex) => {
    accumulator.add(computeFaceNormal(geometry, faceIndex));
  });
  if (faceIndices.length > 0) {
    accumulator.divideScalar(faceIndices.length);
  }
  return accumulator.normalize();
}

/**
 * Collects all unique vertex indices referenced by the given face indices.
 * @param geometry The buffer geometry containing vertex data.
 * @param faceIndices The array of triangle indices.
 * @returns A sorted array of unique vertex indices.
 */
export function getUniqueVertexIndicesForFaces(
  geometry: THREE.BufferGeometry,
  faceIndices: number[]
): number[] {
  return collectUniqueVertices(geometry, faceIndices);
}

/**
 * Displaces selected face vertices along a normal (legacy pure math helper).
 * @param geometry The source buffer geometry.
 * @param faceIndices The triangle indices to extrude.
 * @param displacement The extrusion distance along the normal.
 * @param normal The direction vector for extrusion.
 * @returns A new Float32Array with the extruded vertex positions.
 */
export function extrudeVertexPositions(
  geometry: THREE.BufferGeometry,
  faceIndices: number[],
  displacement: number,
  normal: THREE.Vector3
): Float32Array {
  const sourcePositions = geometry.getAttribute('position');
  const vertexCount = sourcePositions.count;
  const result = new Float32Array(vertexCount * 3);
  const displacedVertices = getUniqueVertexIndicesForFaces(geometry, faceIndices);
  const displacedSet = new Set(displacedVertices);
  const displacementVector = normal.clone().multiplyScalar(displacement);
  for (let i = 0; i < vertexCount; i++) {
    const x = sourcePositions.getX(i);
    const y = sourcePositions.getY(i);
    const z = sourcePositions.getZ(i);
    if (displacedSet.has(i)) {
      result[i * 3] = x + displacementVector.x;
      result[i * 3 + 1] = y + displacementVector.y;
      result[i * 3 + 2] = z + displacementVector.z;
    } else {
      result[i * 3] = x;
      result[i * 3 + 1] = y;
      result[i * 3 + 2] = z;
    }
  }
  return result;
}

/**
 * Returns the three vertex indices of a face for external callers.
 * @param geometry The buffer geometry.
 * @param faceIndex The triangle index.
 * @returns The three position-attribute indices.
 */
export function getFaceVertexIndices(
  geometry: THREE.BufferGeometry,
  faceIndex: number
): [number, number, number] {
  return getTriangleVertexIndices(geometry, faceIndex);
}

/**
 * Splits vertices that are shared between selected and non-selected faces.
 * @param geometry The source buffer geometry.
 * @param faceIndices The triangle indices being extruded.
 * @returns A new geometry with shared vertices duplicated.
 */
export function splitSharedVertices(
  geometry: THREE.BufferGeometry,
  faceIndices: number[]
): THREE.BufferGeometry {
  const sourcePositions = geometry.getAttribute('position');
  const selectedVertices = getUniqueVertexIndicesForFaces(geometry, faceIndices);
  const selectedSet = new Set(selectedVertices);
  const vertexCount = sourcePositions.count;
  const faceCount = Math.floor(vertexCount / 3);
  const selectedFacesSet = new Set(faceIndices);
  const vertexToFaces = buildVertexToFaceMap(vertexCount, faceCount);
  const sharedVertexMap = identifySharedVertices(
    selectedSet,
    vertexToFaces,
    selectedFacesSet,
    vertexCount
  );
  return buildSplitGeometry(geometry, vertexCount, sharedVertexMap);
}

/**
 * Merges vertices that are within a threshold distance of each other.
 * @param geometry The source geometry to merge vertices in.
 * @param threshold The maximum distance for vertices to be considered coincident.
 * @returns A new geometry with coincident vertices merged.
 */
export function mergeCoincidentVertices(
  geometry: THREE.BufferGeometry,
  threshold: number
): THREE.BufferGeometry {
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  const vertexCount = positions.count;
  const mergeMap = buildMergeMap(positions, vertexCount, threshold);
  const newPositions = applyMergeMap(positions, vertexCount, mergeMap);
  const newGeometry = geometry.clone();
  newGeometry.setAttribute('position', new THREE.BufferAttribute(newPositions, 3));
  return newGeometry;
}

/**
 * Builds a map of each vertex to the face indices that reference it (non-indexed).
 * @param vertexCount Total vertex count.
 * @param faceCount Number of triangular faces.
 * @returns Map from vertex index to face indices.
 */
function buildVertexToFaceMap(
  vertexCount: number,
  faceCount: number
): Map<number, number[]> {
  const vertexToFaces = new Map<number, number[]>();
  for (let i = 0; i < vertexCount; i++) {
    vertexToFaces.set(i, []);
  }
  for (let face = 0; face < faceCount; face++) {
    const base = face * 3;
    vertexToFaces.get(base)?.push(face);
    vertexToFaces.get(base + 1)?.push(face);
    vertexToFaces.get(base + 2)?.push(face);
  }
  return vertexToFaces;
}

/**
 * Identifies shared vertices and maps them to new duplicate indices.
 * @param selectedSet Vertices belonging to selected faces.
 * @param vertexToFaces Map of vertex to face indices.
 * @param selectedFacesSet Selected face indices.
 * @param vertexCount Original vertex count.
 * @returns Map of original index to new duplicate index.
 */
function identifySharedVertices(
  selectedSet: Set<number>,
  vertexToFaces: Map<number, number[]>,
  selectedFacesSet: Set<number>,
  vertexCount: number
): Map<number, number> {
  const sharedVertexMap = new Map<number, number>();
  let nextDuplicateIndex = vertexCount;
  selectedSet.forEach((vertex) => {
    const faces = vertexToFaces.get(vertex) || [];
    const isShared = faces.some((face) => !selectedFacesSet.has(face));
    if (isShared) {
      sharedVertexMap.set(vertex, nextDuplicateIndex);
      nextDuplicateIndex += 1;
    }
  });
  return sharedVertexMap;
}

/**
 * Builds a new geometry with split vertices for shared vertex indices.
 * @param geometry Source geometry.
 * @param vertexCount Original vertex count.
 * @param sharedVertexMap Shared vertex mapping.
 * @returns New geometry with split vertices.
 */
function buildSplitGeometry(
  geometry: THREE.BufferGeometry,
  vertexCount: number,
  sharedVertexMap: Map<number, number>
): THREE.BufferGeometry {
  const sourcePositions = geometry.getAttribute('position');
  const maxIndex = sharedVertexMap.size > 0
    ? Math.max(...Array.from(sharedVertexMap.values()))
    : vertexCount - 1;
  const newVertexCount = maxIndex + 1;
  const newPositions = new Float32Array(newVertexCount * 3);
  for (let i = 0; i < vertexCount; i++) {
    newPositions[i * 3] = sourcePositions.getX(i);
    newPositions[i * 3 + 1] = sourcePositions.getY(i);
    newPositions[i * 3 + 2] = sourcePositions.getZ(i);
  }
  sharedVertexMap.forEach((newIndex, origIndex) => {
    newPositions[newIndex * 3] = sourcePositions.getX(origIndex);
    newPositions[newIndex * 3 + 1] = sourcePositions.getY(origIndex);
    newPositions[newIndex * 3 + 2] = sourcePositions.getZ(origIndex);
  });
  const newGeometry = geometry.clone();
  newGeometry.setAttribute('position', new THREE.BufferAttribute(newPositions, 3));
  return newGeometry;
}

/**
 * Builds a merge map for coincident vertices.
 * @param positions Position attribute.
 * @param vertexCount Total vertex count.
 * @param threshold Distance threshold for merging.
 * @returns Map from source vertex index to target vertex index.
 */
function buildMergeMap(
  positions: THREE.BufferAttribute,
  vertexCount: number,
  threshold: number
): Map<number, number> {
  const mergeMap = new Map<number, number>();
  const processed = new Set<number>();
  for (let i = 0; i < vertexCount; i++) {
    if (processed.has(i)) continue;
    for (let j = i + 1; j < vertexCount; j++) {
      if (processed.has(j)) continue;
      const dist = measureVertexDistance(positions, i, j);
      if (dist < threshold) {
        mergeMap.set(j, i);
        processed.add(j);
      }
    }
    processed.add(i);
  }
  return mergeMap;
}

/**
 * Applies a merge map to a positions array.
 * @param positions Source position attribute.
 * @param vertexCount Total vertex count.
 * @param mergeMap Mapping of vertices to merge.
 * @returns New float array with merged positions.
 */
function applyMergeMap(
  positions: THREE.BufferAttribute,
  vertexCount: number,
  mergeMap: Map<number, number>
): Float32Array {
  const newPositions = new Float32Array(positions.array as ArrayLike<number>);
  mergeMap.forEach((targetIndex, sourceIndex) => {
    newPositions[sourceIndex * 3] = newPositions[targetIndex * 3];
    newPositions[sourceIndex * 3 + 1] = newPositions[targetIndex * 3 + 1];
    newPositions[sourceIndex * 3 + 2] = newPositions[targetIndex * 3 + 2];
  });
  return newPositions;
}

/**
 * Computes the Euclidean distance between two vertices.
 * @param positions Position attribute.
 * @param indexA First vertex index.
 * @param indexB Second vertex index.
 * @returns Distance between the vertices.
 */
function measureVertexDistance(
  positions: THREE.BufferAttribute,
  indexA: number,
  indexB: number
): number {
  const vA = getVertexPosition(positions, indexA);
  const vB = getVertexPosition(positions, indexB);
  return vA.distanceTo(vB);
}
