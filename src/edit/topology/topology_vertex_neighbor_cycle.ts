import type { TopologyWorkingFace } from './topology_working_face.js';

/**
 * Collects the ordered neighbor cycle around a vertex from incident faces.
 *
 * @param faces Working faces.
 * @param vertexIndex Vertex whose link is collected.
 * @returns Ordered neighbors, or null when the vertex is unused.
 */
export function collectTopologyVertexNeighborCycle(
  faces: readonly TopologyWorkingFace[],
  vertexIndex: number,
): number[] | null {
  const nextNeighbor = buildNeighborSuccessorMap(faces, vertexIndex);
  if (nextNeighbor.size === 0) {
    return null;
  }
  const start = pickNeighborWalkStart(nextNeighbor);
  if (start === null) {
    return null;
  }
  return walkNeighborCycle(nextNeighbor, start);
}

/**
 * Maps each incoming neighbor to the next neighbor around the vertex.
 *
 * @param faces Working faces.
 * @param vertexIndex Center vertex.
 * @returns Successor map.
 */
function buildNeighborSuccessorMap(faces: readonly TopologyWorkingFace[], vertexIndex: number): Map<number, number> {
  const nextNeighbor = new Map<number, number>();
  for (const face of faces) {
    appendFaceNeighborSuccessor(face, vertexIndex, nextNeighbor);
  }
  return nextNeighbor;
}

/**
 * Records the prev→next neighbor pair from one incident face.
 *
 * @param face Incident face.
 * @param vertexIndex Center vertex.
 * @param nextNeighbor Successor map.
 */
function appendFaceNeighborSuccessor(
  face: TopologyWorkingFace,
  vertexIndex: number,
  nextNeighbor: Map<number, number>,
): void {
  const corner = face.vertexIndices.indexOf(vertexIndex);
  if (corner < 0) {
    return;
  }
  const count = face.vertexIndices.length;
  const previous = face.vertexIndices[(corner + count - 1) % count];
  const next = face.vertexIndices[(corner + 1) % count];
  if (previous === undefined || next === undefined) {
    return;
  }
  nextNeighbor.set(previous, next);
}

/**
 * Picks a walk start: a neighbor that is not the successor of another, else
 * any.
 *
 * @param nextNeighbor Successor map.
 * @returns Start neighbor, or null when empty.
 */
function pickNeighborWalkStart(nextNeighbor: Map<number, number>): number | null {
  const destinations = new Set(nextNeighbor.values());
  for (const source of nextNeighbor.keys()) {
    if (!destinations.has(source)) {
      return source;
    }
  }
  const first = nextNeighbor.keys().next();
  if (first.done) {
    return null;
  }
  return first.value;
}

/**
 * Walks the neighbor successor map from a start vertex.
 *
 * @param nextNeighbor Successor map.
 * @param start First neighbor.
 * @returns Ordered neighbors.
 */
function walkNeighborCycle(nextNeighbor: Map<number, number>, start: number): number[] {
  const cycle: number[] = [];
  const seen = new Set<number>();
  let cursor: number | undefined = start;
  while (cursor !== undefined && !seen.has(cursor)) {
    cycle.push(cursor);
    seen.add(cursor);
    cursor = nextNeighbor.get(cursor);
  }
  return cycle;
}
