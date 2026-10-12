import { SolidPlane } from '@/solid/brush/solid_plane.js';
import { projectWorkingFaceCornerUvs, refitPlanarWorkingFaceCornerUvs } from './topology_edge_dissolve_face_uv.js';
import { compactTopologyWorkingGeometry } from './topology_working_compact.js';
import type { TopologyWorkingFace } from './topology_working_face.js';
import { cloneTopologyWorkingGeometry, type TopologyWorkingGeometry } from './topology_working_geometry.js';
import { collectTopologyVertexNeighborCycle } from './topology_vertex_neighbor_cycle.js';
import { topologyWorkingVertexRead } from './topology_working_vertex_read.js';
import {
  topologyOperatorApplied,
  topologyOperatorRefused,
  type TopologyOperatorResult,
} from './topology_operator_result.js';

/** Minimum remaining vertices after a convex-solid vertex dissolve. */
const BRUSH_MIN_VERTEX_COUNT = 4;

/** Minimum remaining faces after a convex-solid vertex dissolve. */
const BRUSH_MIN_FACE_COUNT = 4;

/**
 * Dissolves one vertex, filling the hole with the neighbor cycle.
 *
 * @param geometry Working geometry mutated in place.
 * @param vertexIndex Vertex to remove.
 * @param requireSolidRemainder When true, refuse below a tetrahedron.
 * @returns Operator result.
 */
export function dissolveTopologyWorkingVertex(
  geometry: TopologyWorkingGeometry,
  vertexIndex: number,
  requireSolidRemainder: boolean,
): TopologyOperatorResult {
  if (!requireSolidRemainder) {
    return dissolveMeshVertexIntoBoundary(geometry, vertexIndex);
  }
  const cycle = collectTopologyVertexNeighborCycle(geometry.faces, vertexIndex);
  if (!cycle || cycle.length < 3) {
    return topologyOperatorRefused('Cannot dissolve this vertex');
  }
  const trial = cloneTopologyWorkingGeometry(geometry);
  removeVertexFromAllFaces(trial, vertexIndex);
  insertCapFaceIfMissing(trial, vertexIndex, cycle);
  compactTopologyWorkingGeometry(trial);
  if (requireSolidRemainder && !workingGeometryMeetsSolidMinimum(trial)) {
    return topologyOperatorRefused('Brush must keep at least 4 vertices and 4 faces');
  }
  geometry.positions = trial.positions;
  geometry.faces = trial.faces;
  return topologyOperatorApplied();
}

/**
 * Joins every face around a mesh vertex into that region's outer boundary.
 *
 * @param geometry Working geometry mutated in place.
 * @param vertexIndex Vertex to remove.
 * @returns Operator result.
 */
function dissolveMeshVertexIntoBoundary(
  geometry: TopologyWorkingGeometry,
  vertexIndex: number,
): TopologyOperatorResult {
  const incident = geometry.faces.filter((face) => face.vertexIndices.includes(vertexIndex));
  const loop = orderOuterBoundary(incident, vertexIndex);
  if (loop.length < 3) {
    return topologyOperatorRefused('Cannot dissolve this vertex');
  }
  const face = createCapWorkingFace(geometry, loop);
  geometry.faces = geometry.faces.filter((item) => !item.vertexIndices.includes(vertexIndex));
  geometry.faces.push(face);
  projectWorkingFaceCornerUvs(geometry, face);
  compactTopologyWorkingGeometry(geometry);
  return topologyOperatorApplied();
}

/**
 * Orders edges that do not touch a vertex into one boundary loop.
 *
 * @param faces Faces around the vertex.
 * @param vertexIndex Vertex being removed.
 * @returns Boundary vertex indices.
 */
function orderOuterBoundary(faces: readonly TopologyWorkingFace[], vertexIndex: number): number[] {
  const next = new Map<number, number>();
  for (const face of faces) {
    appendOuterEdges(face, vertexIndex, next);
  }
  return walkEdgeMap(next);
}

/**
 * Records one face's edges that do not touch a vertex.
 *
 * @param face Face to scan.
 * @param vertexIndex Vertex being removed.
 * @param next Directed edge map.
 */
function appendOuterEdges(face: TopologyWorkingFace, vertexIndex: number, next: Map<number, number>): void {
  const corners = face.vertexIndices;
  const count = corners.length;
  for (let index = 0; index < count; index++) {
    const from = corners[index];
    const to = corners[(index + 1) % count];
    if (from === undefined || to === undefined || from === vertexIndex || to === vertexIndex) {
      continue;
    }
    next.set(from, to);
  }
}

/**
 * Walks a directed edge map into a loop.
 *
 * @param next Vertex to the next boundary vertex.
 * @returns Loop vertices.
 */
function walkEdgeMap(next: ReadonlyMap<number, number>): number[] {
  const start = next.keys().next().value;
  if (start === undefined) {
    return [];
  }
  const loop = [start];
  let cursor = next.get(start);
  while (cursor !== undefined && cursor !== start && loop.length <= next.size) {
    loop.push(cursor);
    cursor = next.get(cursor);
  }
  return loop;
}

/**
 * Removes a vertex from every face loop that contains it.
 *
 * @param geometry Working geometry.
 * @param vertexIndex Vertex to strip.
 */
function removeVertexFromAllFaces(geometry: TopologyWorkingGeometry, vertexIndex: number): void {
  for (const face of geometry.faces) {
    removeVertexFromFace(face, vertexIndex);
  }
}

/**
 * Removes one corner from a face when present.
 *
 * @param face Face to update.
 * @param vertexIndex Vertex to strip.
 */
function removeVertexFromFace(face: TopologyWorkingFace, vertexIndex: number): void {
  const corner = face.vertexIndices.indexOf(vertexIndex);
  if (corner < 0) {
    return;
  }
  face.vertexIndices.splice(corner, 1);
  face.cornerUvs.splice(corner, 1);
}

/**
 * Inserts a cap face from the neighbor cycle when the hole is not already
 * closed.
 *
 * @param geometry Working geometry.
 * @param removedVertex Removed vertex index (for winding).
 * @param cycle Neighbor cycle.
 */
function insertCapFaceIfMissing(
  geometry: TopologyWorkingGeometry,
  removedVertex: number,
  cycle: readonly number[],
): void {
  if (workingGeometryHasFaceLoop(geometry, cycle)) {
    return;
  }
  const ordered = orientCapTowardRemovedVertex(geometry, cycle, removedVertex);
  const face = createCapWorkingFace(geometry, ordered);
  geometry.faces.push(face);
  refitPlanarWorkingFaceCornerUvs(geometry, face);
}

/**
 * Returns whether a face already uses the same vertex set as the cycle.
 *
 * @param geometry Working geometry.
 * @param cycle Neighbor cycle.
 * @returns True when a matching face exists.
 */
function workingGeometryHasFaceLoop(geometry: TopologyWorkingGeometry, cycle: readonly number[]): boolean {
  const wanted = new Set(cycle);
  for (const face of geometry.faces) {
    if (face.vertexIndices.length !== cycle.length) {
      continue;
    }
    if (faceUsesExactVertexSet(face, wanted)) {
      return true;
    }
  }
  return false;
}

/**
 * Returns whether a face uses exactly the given vertex set.
 *
 * @param face Face to test.
 * @param wanted Vertex set.
 * @returns True when the sets match.
 */
function faceUsesExactVertexSet(face: TopologyWorkingFace, wanted: ReadonlySet<number>): boolean {
  for (const vertexIndex of face.vertexIndices) {
    if (!wanted.has(vertexIndex)) {
      return false;
    }
  }
  return true;
}

/**
 * Orients a cap so the removed vertex lies outside its plane.
 *
 * @param geometry Working geometry.
 * @param cycle Neighbor cycle.
 * @param removedVertex Removed vertex index.
 * @returns Oriented cycle.
 */
function orientCapTowardRemovedVertex(
  geometry: TopologyWorkingGeometry,
  cycle: readonly number[],
  removedVertex: number,
): number[] {
  const ordered = cycle.slice();
  const points = collectCyclePositions(geometry, ordered);
  const removed = topologyWorkingVertexRead(geometry, removedVertex);
  if (points.length < 3 || !removed) {
    return ordered;
  }
  const plane = SolidPlane.fromPolygon(points);
  if (plane.signedDistance(removed) < 0) {
    ordered.reverse();
  }
  return ordered;
}

/**
 * Collects positions for a vertex cycle.
 *
 * @param geometry Working geometry.
 * @param cycle Vertex indices.
 * @returns Positions.
 */
function collectCyclePositions(geometry: TopologyWorkingGeometry, cycle: readonly number[]): import('three').Vector3[] {
  const points: import('three').Vector3[] = [];
  for (const vertexIndex of cycle) {
    const position = topologyWorkingVertexRead(geometry, vertexIndex);
    if (position) {
      points.push(position);
    }
  }
  return points;
}

/**
 * Builds a cap face. Corner UVs are placeholders until the planar refit.
 *
 * @param geometry Working geometry.
 * @param cycle Oriented neighbor cycle.
 * @returns New working face.
 */
function createCapWorkingFace(geometry: TopologyWorkingGeometry, cycle: readonly number[]): TopologyWorkingFace {
  const template = geometry.faces[0];
  const textureId = template ? template.textureId : '';
  const cornerUvs = cycle.map(() => ({ u: 0, v: 0 }));
  return {
    vertexIndices: cycle.slice(),
    cornerUvs,
    textureId,
  };
}

/**
 * Returns whether working geometry still meets solid-brush minimums.
 *
 * @param geometry Working geometry.
 * @returns True when at least four vertices and four faces remain.
 */
function workingGeometryMeetsSolidMinimum(geometry: TopologyWorkingGeometry): boolean {
  if (geometry.positions.length < BRUSH_MIN_VERTEX_COUNT) {
    return false;
  }
  return geometry.faces.length >= BRUSH_MIN_FACE_COUNT;
}
