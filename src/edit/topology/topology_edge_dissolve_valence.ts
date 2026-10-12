import { TOPOLOGY_VERTEX_EQUAL_EPSILON_SQUARED } from './topology_epsilon.js';
import type { TopologyWorkingFace } from './topology_working_face.js';
import type { TopologyWorkingGeometry } from './topology_working_geometry.js';

/**
 * Removes endpoints of a dissolved edge when only two real edges remain.
 * Coincident copies created for UV seams are included. Degenerate edges do not
 * count toward valence.
 *
 * @param geometry Working geometry mutated in place.
 * @param vertexA First dissolved endpoint.
 * @param vertexB Second dissolved endpoint.
 */
export function dissolveTwoValentEdgeEndpoints(
  geometry: TopologyWorkingGeometry,
  vertexA: number,
  vertexB: number,
): void {
  const candidates = collectEndpointVertexIndices(geometry, vertexA, vertexB);
  let guard = candidates.length;
  while (guard > 0) {
    guard -= 1;
    if (!dissolveNextTwoValentEndpoint(geometry, candidates)) {
      return;
    }
  }
}

/**
 * Dissolves one remaining two-valent endpoint.
 *
 * @param geometry Working geometry.
 * @param candidates Endpoint vertex indices still eligible.
 * @returns True when a vertex was removed.
 */
function dissolveNextTwoValentEndpoint(geometry: TopologyWorkingGeometry, candidates: number[]): boolean {
  const vertexIndex = findDissolvableEndpoint(geometry, candidates);
  if (vertexIndex < 0) {
    return false;
  }
  removeVertexFromWorkingFaces(geometry, vertexIndex);
  dropCandidate(candidates, vertexIndex);
  return true;
}

/**
 * Finds an endpoint that has two real neighbors and can leave every face.
 *
 * @param geometry Working geometry.
 * @param candidates Endpoint vertex indices.
 * @returns Vertex index, or -1 when none can be dissolved.
 */
function findDissolvableEndpoint(geometry: TopologyWorkingGeometry, candidates: readonly number[]): number {
  for (const vertexIndex of candidates) {
    if (!endpointCanDissolve(geometry, vertexIndex)) {
      continue;
    }
    return vertexIndex;
  }
  return -1;
}

/**
 * Returns whether one endpoint is two-valent and safe to remove.
 *
 * @param geometry Working geometry.
 * @param vertexIndex Candidate vertex.
 * @returns True when the vertex should be dissolved.
 */
function endpointCanDissolve(geometry: TopologyWorkingGeometry, vertexIndex: number): boolean {
  if (collectRealNeighbors(geometry, vertexIndex).length !== 2) {
    return false;
  }
  return vertexRemovalKeepsPolygons(geometry, vertexIndex);
}

/**
 * Collects vertex indices that sit on either dissolved endpoint.
 *
 * @param geometry Working geometry.
 * @param vertexA First endpoint.
 * @param vertexB Second endpoint.
 * @returns Matching vertex indices.
 */
function collectEndpointVertexIndices(geometry: TopologyWorkingGeometry, vertexA: number, vertexB: number): number[] {
  const anchors = endpointAnchorPositions(geometry, vertexA, vertexB);
  const indices: number[] = [];
  for (let index = 0; index < geometry.positions.length; index++) {
    if (positionMatchesAnchor(geometry.positions[index], anchors)) {
      indices.push(index);
    }
  }
  return indices;
}

/**
 * Reads the two endpoint positions when they exist.
 *
 * @param geometry Working geometry.
 * @param vertexA First endpoint.
 * @param vertexB Second endpoint.
 * @returns Anchor positions.
 */
function endpointAnchorPositions(
  geometry: TopologyWorkingGeometry,
  vertexA: number,
  vertexB: number,
): Array<{ x: number; y: number; z: number }> {
  const anchors: Array<{ x: number; y: number; z: number }> = [];
  pushAnchor(geometry.positions[vertexA], anchors);
  pushAnchor(geometry.positions[vertexB], anchors);
  return anchors;
}

/**
 * Appends a position anchor when the vertex exists.
 *
 * @param position Vertex position, if present.
 * @param anchors Anchor list.
 */
function pushAnchor(
  position: { x: number; y: number; z: number } | undefined,
  anchors: Array<{ x: number; y: number; z: number }>,
): void {
  if (!position) {
    return;
  }
  anchors.push({ x: position.x, y: position.y, z: position.z });
}

/**
 * Returns whether a position lies on an endpoint anchor.
 *
 * @param position Candidate position.
 * @param anchors Endpoint anchors.
 * @returns True when the position matches an anchor.
 */
function positionMatchesAnchor(
  position: { x: number; y: number; z: number } | undefined,
  anchors: ReadonlyArray<{ x: number; y: number; z: number }>,
): boolean {
  if (!position) {
    return false;
  }
  for (const anchor of anchors) {
    if (positionsCoincide(position, anchor)) {
      return true;
    }
  }
  return false;
}

/**
 * Returns whether two positions are within the weld epsilon.
 *
 * @param first First position.
 * @param second Second position.
 * @returns True when the positions coincide.
 */
function positionsCoincide(
  first: { x: number; y: number; z: number },
  second: { x: number; y: number; z: number },
): boolean {
  const dx = first.x - second.x;
  const dy = first.y - second.y;
  const dz = first.z - second.z;
  return dx * dx + dy * dy + dz * dz <= TOPOLOGY_VERTEX_EQUAL_EPSILON_SQUARED;
}

/**
 * Collects unique neighbors joined by a non-degenerate edge.
 *
 * @param geometry Working geometry.
 * @param vertexIndex Vertex to inspect.
 * @returns Neighbor vertex indices.
 */
function collectRealNeighbors(geometry: TopologyWorkingGeometry, vertexIndex: number): number[] {
  const neighbors: number[] = [];
  for (const face of geometry.faces) {
    appendFaceRealNeighbors(geometry, face, vertexIndex, neighbors);
  }
  return neighbors;
}

/**
 * Appends real neighbors of one vertex around one face.
 *
 * @param geometry Working geometry.
 * @param face Face to scan.
 * @param vertexIndex Vertex to inspect.
 * @param neighbors Accumulator of unique neighbors.
 */
function appendFaceRealNeighbors(
  geometry: TopologyWorkingGeometry,
  face: TopologyWorkingFace,
  vertexIndex: number,
  neighbors: number[],
): void {
  const corners = face.vertexIndices;
  const count = corners.length;
  for (let corner = 0; corner < count; corner++) {
    if (corners[corner] !== vertexIndex) {
      continue;
    }
    considerNeighbor(geometry, vertexIndex, corners[(corner + count - 1) % count], neighbors);
    considerNeighbor(geometry, vertexIndex, corners[(corner + 1) % count], neighbors);
  }
}

/**
 * Records one neighbor when the edge has length.
 *
 * @param geometry Working geometry.
 * @param vertexIndex Origin vertex.
 * @param neighbor Neighbor vertex, if present.
 * @param neighbors Accumulator.
 */
function considerNeighbor(
  geometry: TopologyWorkingGeometry,
  vertexIndex: number,
  neighbor: number | undefined,
  neighbors: number[],
): void {
  if (neighbor === undefined || neighbor === vertexIndex || neighbors.includes(neighbor)) {
    return;
  }
  if (edgeIsDegenerate(geometry, vertexIndex, neighbor)) {
    return;
  }
  neighbors.push(neighbor);
}

/**
 * Returns whether an edge is shorter than the weld epsilon.
 *
 * @param geometry Working geometry.
 * @param vertexA First vertex.
 * @param vertexB Second vertex.
 * @returns True when the edge is degenerate.
 */
function edgeIsDegenerate(geometry: TopologyWorkingGeometry, vertexA: number, vertexB: number): boolean {
  const start = geometry.positions[vertexA];
  const end = geometry.positions[vertexB];
  if (!start || !end) {
    return true;
  }
  return start.distanceToSquared(end) <= TOPOLOGY_VERTEX_EQUAL_EPSILON_SQUARED;
}

/**
 * Returns whether removing a vertex leaves every incident face with 3 corners.
 *
 * @param geometry Working geometry.
 * @param vertexIndex Vertex to test.
 * @returns True when every face stays a polygon.
 */
function vertexRemovalKeepsPolygons(geometry: TopologyWorkingGeometry, vertexIndex: number): boolean {
  for (const face of geometry.faces) {
    if (!faceStaysPolygonWithoutVertex(face, vertexIndex)) {
      return false;
    }
  }
  return true;
}

/**
 * Returns whether one face stays a polygon after losing a vertex.
 *
 * @param face Face to test.
 * @param vertexIndex Vertex that would be removed.
 * @returns True when the face is unaffected or still has three corners.
 */
function faceStaysPolygonWithoutVertex(face: TopologyWorkingFace, vertexIndex: number): boolean {
  const hits = countVertexOccurrences(face, vertexIndex);
  if (hits === 0) {
    return true;
  }
  return face.vertexIndices.length - hits >= 3;
}

/**
 * Counts how many corners use a vertex.
 *
 * @param face Face to scan.
 * @param vertexIndex Vertex to count.
 * @returns Occurrence count.
 */
function countVertexOccurrences(face: TopologyWorkingFace, vertexIndex: number): number {
  let hits = 0;
  for (const corner of face.vertexIndices) {
    if (corner === vertexIndex) {
      hits += 1;
    }
  }
  return hits;
}

/**
 * Strips a vertex corner from every face.
 *
 * @param geometry Working geometry.
 * @param vertexIndex Vertex to strip.
 */
function removeVertexFromWorkingFaces(geometry: TopologyWorkingGeometry, vertexIndex: number): void {
  for (const face of geometry.faces) {
    removeAllVertexCorners(face, vertexIndex);
  }
}

/**
 * Removes every corner of a face that uses a vertex.
 *
 * @param face Face to update.
 * @param vertexIndex Vertex to strip.
 */
function removeAllVertexCorners(face: TopologyWorkingFace, vertexIndex: number): void {
  let corner = face.vertexIndices.indexOf(vertexIndex);
  while (corner >= 0) {
    face.vertexIndices.splice(corner, 1);
    face.cornerUvs.splice(corner, 1);
    corner = face.vertexIndices.indexOf(vertexIndex);
  }
}

/**
 * Drops one index from the candidate list.
 *
 * @param candidates Candidate indices.
 * @param vertexIndex Index to drop.
 */
function dropCandidate(candidates: number[], vertexIndex: number): void {
  const index = candidates.indexOf(vertexIndex);
  if (index >= 0) {
    candidates.splice(index, 1);
  }
}
