import { SolidPlane } from '@/solid/brush/solid_plane.js';
import { refitPlanarWorkingFaceCornerUvs } from './topology_edge_dissolve_face_uv.js';
import { dissolveTwoValentEdgeEndpoints } from './topology_edge_dissolve_valence.js';
import { compactTopologyWorkingGeometry } from './topology_working_compact.js';
import { topologyWorkingFaceEdgeCornerIndex } from './topology_working_face_edge_index.js';
import type { TopologyWorkingFace } from './topology_working_face.js';
import {
  assignTopologyWorkingGeometry,
  cloneTopologyWorkingGeometry,
  type TopologyWorkingGeometry,
} from './topology_working_geometry.js';
import { topologyWorkingVertexRead } from './topology_working_vertex_read.js';
import {
  topologyOperatorApplied,
  topologyOperatorRefused,
  type TopologyOperatorResult,
} from './topology_operator_result.js';

/**
 * Dissolves an undirected edge by merging the two faces that share it.
 *
 * @param geometry Working geometry mutated in place.
 * @param vertexA First endpoint.
 * @param vertexB Second endpoint.
 * @param requirePlanarUnion When true, refuse a non-planar merged face.
 * @returns Operator result.
 */
export function dissolveTopologyWorkingEdge(
  geometry: TopologyWorkingGeometry,
  vertexA: number,
  vertexB: number,
  requirePlanarUnion: boolean,
): TopologyOperatorResult {
  const pair = findFacesSharingEdge(geometry, vertexA, vertexB);
  if (!pair) {
    return topologyOperatorRefused('Select an edge shared by two faces');
  }
  return commitDissolvedEdge(geometry, pair, vertexA, vertexB, requirePlanarUnion);
}

/**
 * Merges the edge, drops two-valent corners, and writes the result.
 *
 * @param geometry Working geometry mutated in place.
 * @param pair Faces that share the edge.
 * @param vertexA First endpoint.
 * @param vertexB Second endpoint.
 * @param requirePlanarUnion When true, restore and refuse a non-planar face.
 * @returns Operator result.
 */
function commitDissolvedEdge(
  geometry: TopologyWorkingGeometry,
  pair: SharedEdgeFacePair,
  vertexA: number,
  vertexB: number,
  requirePlanarUnion: boolean,
): TopologyOperatorResult {
  const snapshot = cloneTopologyWorkingGeometry(geometry);
  const merged = mergeAndDropTwoValentCorners(geometry, pair, vertexA, vertexB, requirePlanarUnion);
  if (!merged) {
    restoreWorkingGeometry(geometry, snapshot);
    return topologyOperatorRefused('Cannot dissolve this edge');
  }
  if (rejectNonPlanarBrushFace(geometry, merged, snapshot, requirePlanarUnion)) {
    return topologyOperatorRefused('Dissolving that edge would leave a non-planar brush face');
  }
  if (requirePlanarUnion) {
    refitPlanarWorkingFaceCornerUvs(geometry, merged);
  }
  compactTopologyWorkingGeometry(geometry);
  return topologyOperatorApplied();
}

/**
 * Merges the two faces and removes two-valent endpoints.
 *
 * @param geometry Working geometry.
 * @param pair Faces that share the edge.
 * @param vertexA First endpoint.
 * @param vertexB Second endpoint.
 * @param requirePlanarUnion When true, remove endpoints left with two edges.
 * @returns Merged face, or null when the loops cannot join.
 */
function mergeAndDropTwoValentCorners(
  geometry: TopologyWorkingGeometry,
  pair: SharedEdgeFacePair,
  vertexA: number,
  vertexB: number,
  requirePlanarUnion: boolean,
): TopologyWorkingFace | null {
  const merged = requirePlanarUnion
    ? mergeFacesAcrossEdge(geometry, pair.first, pair.second, vertexA, vertexB)
    : mergeFacesSharingEndpoints(pair.first, pair.second, vertexA, vertexB);
  if (!merged) {
    return null;
  }
  replaceFacePairWithMerged(geometry, pair.firstIndex, pair.secondIndex, merged);
  const touched = collectFacesUsingVertices(geometry, vertexA, vertexB);
  dissolveTwoValentEdgeEndpoints(geometry, vertexA, vertexB);
  if (!requirePlanarUnion) {
    refitRemainingFaces(geometry, touched, merged);
  }
  return merged;
}

/**
 * Collects faces that still use either dissolved endpoint.
 *
 * @param geometry Working geometry.
 * @param vertexA First endpoint.
 * @param vertexB Second endpoint.
 * @returns Faces that will lose those corners.
 */
function collectFacesUsingVertices(
  geometry: TopologyWorkingGeometry,
  vertexA: number,
  vertexB: number,
): TopologyWorkingFace[] {
  const faces: TopologyWorkingFace[] = [];
  for (const face of geometry.faces) {
    if (faceUsesVertex(face, vertexA) || faceUsesVertex(face, vertexB)) {
      faces.push(face);
    }
  }
  return faces;
}

/**
 * Returns whether a face loop contains a vertex.
 *
 * @param face Face to test.
 * @param vertexIndex Vertex index.
 * @returns True when the vertex is a corner.
 */
function faceUsesVertex(face: TopologyWorkingFace, vertexIndex: number): boolean {
  return face.vertexIndices.includes(vertexIndex);
}

/**
 * Rewrites planar corner UVs on faces changed by a mesh edge dissolve.
 *
 * @param geometry Working geometry.
 * @param touched Faces that used the dissolved endpoints.
 * @param merged Joined face.
 */
function refitRemainingFaces(
  geometry: TopologyWorkingGeometry,
  touched: readonly TopologyWorkingFace[],
  merged: TopologyWorkingFace,
): void {
  refitPlanarWorkingFaceCornerUvs(geometry, merged);
  for (const face of touched) {
    if (face !== merged && geometry.faces.includes(face)) {
      refitPlanarWorkingFaceCornerUvs(geometry, face);
    }
  }
}

/**
 * Restores geometry when a brush dissolve would leave a bent face.
 *
 * @param geometry Working geometry.
 * @param merged Merged face.
 * @param snapshot Pre-dissolve snapshot.
 * @param requirePlanarUnion When true, a bent face is refused.
 * @returns True when the dissolve was rejected.
 */
function rejectNonPlanarBrushFace(
  geometry: TopologyWorkingGeometry,
  merged: TopologyWorkingFace,
  snapshot: TopologyWorkingGeometry,
  requirePlanarUnion: boolean,
): boolean {
  if (!requirePlanarUnion || workingFaceIsPlanar(geometry, merged)) {
    return false;
  }
  restoreWorkingGeometry(geometry, snapshot);
  return true;
}

/**
 * Copies a snapshot back onto working geometry.
 *
 * @param geometry Geometry to restore.
 * @param snapshot Snapshot taken before the dissolve.
 */
function restoreWorkingGeometry(geometry: TopologyWorkingGeometry, snapshot: TopologyWorkingGeometry): void {
  assignTopologyWorkingGeometry(geometry, snapshot);
}

/** Two faces that share an edge. */
interface SharedEdgeFacePair {
  first: TopologyWorkingFace;
  second: TopologyWorkingFace;
  firstIndex: number;
  secondIndex: number;
}

/**
 * Finds the two faces that contain an undirected edge.
 *
 * @param geometry Working geometry.
 * @param vertexA First endpoint.
 * @param vertexB Second endpoint.
 * @returns Face pair, or null when the edge is not shared.
 */
function findFacesSharingEdge(
  geometry: TopologyWorkingGeometry,
  vertexA: number,
  vertexB: number,
): SharedEdgeFacePair | null {
  const hits: Array<{ face: TopologyWorkingFace; index: number }> = [];
  for (let index = 0; index < geometry.faces.length; index++) {
    const face = geometry.faces[index];
    if (!face) {
      continue;
    }
    if (topologyWorkingFaceEdgeCornerIndex(face, vertexA, vertexB) >= 0) {
      hits.push({ face, index });
    }
  }
  if (hits.length !== 2 || !hits[0] || !hits[1]) {
    return null;
  }
  return {
    first: hits[0].face,
    second: hits[1].face,
    firstIndex: hits[0].index,
    secondIndex: hits[1].index,
  };
}

/**
 * Joins the two faces that share an edge and keeps the endpoints once. Does not
 * compact vertices or copy seam corners.
 *
 * @param geometry Working geometry mutated in place.
 * @param vertexA First endpoint.
 * @param vertexB Second endpoint.
 * @returns True when the faces were joined.
 */
export function joinWorkingFacesAcrossEdge(
  geometry: TopologyWorkingGeometry,
  vertexA: number,
  vertexB: number,
): boolean {
  const pair = findFacesSharingEdge(geometry, vertexA, vertexB);
  if (!pair) {
    return false;
  }
  const merged = mergeFacesSharingEndpoints(pair.first, pair.second, vertexA, vertexB);
  if (!merged) {
    return false;
  }
  replaceFacePairWithMerged(geometry, pair.firstIndex, pair.secondIndex, merged);
  return true;
}

/**
 * Merges two faces across an edge without copying the endpoints.
 *
 * @param first First face.
 * @param second Second face.
 * @param vertexA Edge endpoint A.
 * @param vertexB Edge endpoint B.
 * @returns Merged face, or null when the loops cannot join.
 */
function mergeFacesSharingEndpoints(
  first: TopologyWorkingFace,
  second: TopologyWorkingFace,
  vertexA: number,
  vertexB: number,
): TopologyWorkingFace | null {
  const firstWalk = walkFaceBoundaryExceptEdge(first, vertexA, vertexB);
  const secondWalk = walkFaceBoundaryExceptEdge(second, vertexA, vertexB);
  if (!firstWalk || !secondWalk) {
    return null;
  }
  const interior = dropWalkEndpoints(secondWalk);
  return {
    vertexIndices: firstWalk.vertexIndices.concat(interior.vertexIndices),
    cornerUvs: firstWalk.cornerUvs.concat(interior.cornerUvs),
    textureId: first.textureId,
  };
}

/**
 * Drops the endpoints from a boundary walk.
 *
 * @param walk Boundary that includes both endpoints.
 * @returns Interior corners only.
 */
function dropWalkEndpoints(walk: FaceOpenWalk): FaceOpenWalk {
  return {
    vertexIndices: walk.vertexIndices.slice(1, -1),
    cornerUvs: walk.cornerUvs.slice(1, -1).map((uv) => ({ u: uv.u, v: uv.v })),
  };
}

/**
 * Merges two face loops across a shared edge and copies the second endpoints.
 *
 * @param geometry Working geometry that receives copied endpoints.
 * @param first First face.
 * @param second Second face.
 * @param vertexA Edge endpoint A.
 * @param vertexB Edge endpoint B.
 * @returns Merged face, or null when the loops cannot join.
 */
function mergeFacesAcrossEdge(
  geometry: TopologyWorkingGeometry,
  first: TopologyWorkingFace,
  second: TopologyWorkingFace,
  vertexA: number,
  vertexB: number,
): TopologyWorkingFace | null {
  const firstWalk = walkFaceBoundaryExceptEdge(first, vertexA, vertexB);
  const secondWalk = walkFaceBoundaryExceptEdge(second, vertexA, vertexB);
  if (!firstWalk || !secondWalk) {
    return null;
  }
  const detached = detachWalkEndpoints(geometry, secondWalk);
  return {
    vertexIndices: firstWalk.vertexIndices.concat(detached.vertexIndices),
    cornerUvs: firstWalk.cornerUvs.concat(detached.cornerUvs),
    textureId: first.textureId,
  };
}

/**
 * Copies the second boundary's endpoints so each side keeps its own UV.
 *
 * @param geometry Working geometry that receives the copies.
 * @param walk Boundary that includes both endpoints.
 * @returns Walk whose first and last vertices are copies.
 */
function detachWalkEndpoints(geometry: TopologyWorkingGeometry, walk: FaceOpenWalk): FaceOpenWalk {
  const vertexIndices = walk.vertexIndices.slice();
  if (vertexIndices.length >= 2) {
    vertexIndices[0] = cloneWorkingVertex(geometry, vertexIndices[0] ?? -1);
    vertexIndices[vertexIndices.length - 1] = cloneWorkingVertex(
      geometry,
      vertexIndices[vertexIndices.length - 1] ?? -1,
    );
  }
  return { vertexIndices, cornerUvs: walk.cornerUvs.map((uv) => ({ u: uv.u, v: uv.v })) };
}

/**
 * Appends a copy of a vertex position and returns the new index.
 *
 * @param geometry Working geometry.
 * @param vertexIndex Vertex to copy.
 * @returns New vertex index, or the original when it is missing.
 */
function cloneWorkingVertex(geometry: TopologyWorkingGeometry, vertexIndex: number): number {
  const position = geometry.positions[vertexIndex];
  if (!position) {
    return vertexIndex;
  }
  geometry.positions.push(position.clone());
  return geometry.positions.length - 1;
}

/** Open walk of a face that omits the dissolved edge. */
interface FaceOpenWalk {
  vertexIndices: number[];
  cornerUvs: Array<{ u: number; v: number }>;
}

/**
 * Walks a face from the far side of a shared edge, omitting that edge.
 *
 * @param face Face to walk.
 * @param vertexA Edge endpoint A.
 * @param vertexB Edge endpoint B.
 * @returns Open walk, or null when the edge is missing.
 */
function walkFaceBoundaryExceptEdge(face: TopologyWorkingFace, vertexA: number, vertexB: number): FaceOpenWalk | null {
  const start = topologyWorkingFaceEdgeCornerIndex(face, vertexA, vertexB);
  if (start < 0) {
    return null;
  }
  const count = face.vertexIndices.length;
  const walk: FaceOpenWalk = { vertexIndices: [], cornerUvs: [] };
  for (let step = 1; step <= count; step++) {
    appendWalkCorner(face, (start + step) % count, walk);
  }
  return walk;
}

/**
 * Appends one face corner onto an open walk.
 *
 * @param face Source face.
 * @param corner Corner index.
 * @param walk Destination walk.
 */
function appendWalkCorner(face: TopologyWorkingFace, corner: number, walk: FaceOpenWalk): void {
  const vertexIndex = face.vertexIndices[corner];
  const uv = face.cornerUvs[corner];
  if (vertexIndex === undefined || !uv) {
    return;
  }
  walk.vertexIndices.push(vertexIndex);
  walk.cornerUvs.push({ u: uv.u, v: uv.v });
}

/**
 * Replaces two faces with one merged face.
 *
 * @param geometry Working geometry.
 * @param firstIndex First face index.
 * @param secondIndex Second face index.
 * @param merged Merged face.
 */
function replaceFacePairWithMerged(
  geometry: TopologyWorkingGeometry,
  firstIndex: number,
  secondIndex: number,
  merged: TopologyWorkingFace,
): void {
  const high = Math.max(firstIndex, secondIndex);
  const low = Math.min(firstIndex, secondIndex);
  geometry.faces.splice(high, 1);
  geometry.faces.splice(low, 1, merged);
}

/**
 * Returns whether a working face is planar within the solid plane epsilon.
 *
 * @param geometry Working geometry.
 * @param face Face to test.
 * @returns True when every vertex lies on the Newell plane.
 */
function workingFaceIsPlanar(geometry: TopologyWorkingGeometry, face: TopologyWorkingFace): boolean {
  const points: import('three').Vector3[] = [];
  for (const vertexIndex of face.vertexIndices) {
    const position = topologyWorkingVertexRead(geometry, vertexIndex);
    if (position) {
      points.push(position);
    }
  }
  if (points.length < 3) {
    return false;
  }
  return everyPointOnSolidPlane(points, SolidPlane.fromPolygon(points));
}

/**
 * Returns whether every point lies on a plane.
 *
 * @param points Polygon points.
 * @param plane Plane to test.
 * @returns True when no point is outside the fat plane.
 */
function everyPointOnSolidPlane(points: readonly import('three').Vector3[], plane: SolidPlane): boolean {
  for (const point of points) {
    if (Math.abs(plane.signedDistance(point)) > 1e-4) {
      return false;
    }
  }
  return true;
}
