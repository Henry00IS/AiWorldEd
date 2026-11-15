import { splitWorkingFaceBetweenVertices } from './topology_face_split.js';
import {
  topologyOperatorApplied,
  topologyOperatorRefused,
  type TopologyOperatorResult,
} from './topology_operator_result.js';
import type { TopologyWorkingFace } from './topology_working_face.js';
import type { TopologyWorkingGeometry } from './topology_working_geometry.js';

/** Outcome of connecting vertices, with the edges that were added. */
export interface TopologyVertexConnectOutcome {
  /** Whether anything changed, and why not. */
  result: TopologyOperatorResult;
  /** New edges as vertex pairs. */
  edges: Array<[number, number]>;
}

/**
 * Cuts every face that holds two or more of the given vertices along new edges
 * between them, walking the selected corners in face order. Existing faces keep
 * their indices; the cut-off parts are appended.
 *
 * @param geometry Working geometry mutated in place.
 * @param vertices Vertices to connect.
 * @returns Outcome with the new edges.
 */
export function connectTopologyWorkingVertices(
  geometry: TopologyWorkingGeometry,
  vertices: readonly number[],
): TopologyVertexConnectOutcome {
  const selected = new Set(vertices);
  if (selected.size < 2) return { result: topologyOperatorRefused('Connect Vertices needs two vertices'), edges: [] };
  const edges: Array<[number, number]> = [];
  const queue = geometry.faces.map((_face, index) => index);
  while (queue.length > 0) {
    const index = queue.pop()!;
    const face = geometry.faces[index]!;
    const pair = findConnectablePair(face, selected);
    const second = pair ? splitWorkingFaceBetweenVertices(face, pair[0], pair[1]) : null;
    if (!pair || !second) continue;
    geometry.faces.push(second);
    queue.push(index, geometry.faces.length - 1);
    edges.push(pair);
  }
  if (edges.length === 0) {
    return { result: topologyOperatorRefused('Connect Vertices needs two vertices across a face'), edges };
  }
  return { result: topologyOperatorApplied(`Connected ${edges.length} edge(s)`), edges };
}

/**
 * Finds two selected corners of a face, next to each other among the selected
 * ones, that are not already joined by a face edge.
 *
 * @param face Face loop.
 * @param selected Selected vertices.
 * @returns Vertex pair in face order, or null.
 */
function findConnectablePair(face: TopologyWorkingFace, selected: ReadonlySet<number>): [number, number] | null {
  const loop = face.vertexIndices;
  const corners = loop.map((_vertex, corner) => corner).filter((corner) => selected.has(loop[corner]!));
  if (corners.length < 2) return null;
  for (let index = 0; index < corners.length; index += 1) {
    const from = corners[index]!;
    const to = corners[(index + 1) % corners.length]!;
    const gap = (to - from + loop.length) % loop.length;
    if (gap > 1 && gap < loop.length - 1) return [loop[from]!, loop[to]!];
  }
  return null;
}
