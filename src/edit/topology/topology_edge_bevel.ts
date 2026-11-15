import * as THREE from 'three';
import type { TopologyEdgeEndpoints } from './topology_edge_subdivide.js';
import { addTopologyWorkingFaceLoop } from './topology_face_make.js';
import {
  topologyOperatorApplied,
  topologyOperatorRefused,
  type TopologyOperatorResult,
} from './topology_operator_result.js';
import type { TopologyWorkingFace } from './topology_working_face.js';
import type { TopologyWorkingGeometry } from './topology_working_geometry.js';

/** Outcome of bevelling edges, with the new chamfer faces. */
export interface TopologyEdgeBevelOutcome {
  /** Whether anything changed, and why not. */
  result: TopologyOperatorResult;
  /** Index of each new chamfer face. */
  faces: number[];
}

/** How one end of a bevelled edge is cut. */
interface BevelCorner {
  /** Original vertex. */
  vertex: number;
  /** Neighbour along the first face, and the point slid towards it. */
  first: { neighbour: number; position: THREE.Vector3 };
  /** Neighbour along the second face, and the point slid towards it. */
  second: { neighbour: number; position: THREE.Vector3 };
}

/**
 * Cuts each selected edge off with a flat chamfer face of the given width. Both
 * faces of the edge are pulled back from it; a corner where only three faces
 * meet is cut away, any other corner keeps its vertex. Edges must lie between
 * two faces and must not touch each other.
 *
 * @param geometry Working geometry mutated in place.
 * @param edges Edges to bevel.
 * @param width Distance each face is pulled back from the edge.
 * @returns Outcome with the chamfer faces.
 */
export function bevelTopologyWorkingEdges(
  geometry: TopologyWorkingGeometry,
  edges: readonly TopologyEdgeEndpoints[],
  width: number,
): TopologyEdgeBevelOutcome {
  const refuse = (message: string) => ({ result: topologyOperatorRefused(message), faces: [] });
  if (!(width > 1e-5)) return refuse('Bevel width is zero');
  if (edges.length === 0) return refuse('Bevel Edges needs selected edges');
  const ends = edges.flatMap(({ vertexA, vertexB }) => [vertexA, vertexB]);
  if (new Set(ends).size !== ends.length) return refuse('Bevel Edges needs edges that do not touch each other');
  const faces: number[] = [];
  for (const edge of edges) {
    const made = bevelOneEdge(geometry, edge, width);
    if (typeof made === 'string') return refuse(made);
    faces.push(made);
  }
  return { result: topologyOperatorApplied(`Bevelled ${faces.length} edge(s)`), faces };
}

/**
 * Bevels one edge.
 *
 * @param geometry Working geometry.
 * @param edge Edge to bevel.
 * @param width Chamfer width.
 * @returns Index of the chamfer face, or a refusal reason.
 */
function bevelOneEdge(geometry: TopologyWorkingGeometry, edge: TopologyEdgeEndpoints, width: number): number | string {
  const first = geometry.faces.findIndex((face) => hasDirectedEdge(face, edge.vertexA, edge.vertexB));
  const second = geometry.faces.findIndex((face) => hasDirectedEdge(face, edge.vertexB, edge.vertexA));
  if (first < 0 || second < 0) return 'Bevel Edges needs edges between two faces';
  const corners = [edge.vertexA, edge.vertexB].map((vertex, index) =>
    planCorner(geometry, vertex, index === 0 ? edge.vertexB : edge.vertexA, [first, second], width),
  );
  if (corners.some((corner) => corner === null)) return 'Bevel width is wider than the neighbouring edges';
  const sides = (corners as BevelCorner[]).map((corner) => cutCorner(geometry, corner, first, second));
  if (sides.some((side) => side === null)) return 'Bevel Edges needs closed surface around both ends';
  const [atA, atB] = sides as Array<{ first: number; second: number; kept: boolean; vertex: number }>;
  const loop = [atA!.first, ...(atA!.kept ? [atA!.vertex] : []), atA!.second];
  loop.push(atB!.second, ...(atB!.kept ? [atB!.vertex] : []), atB!.first);
  const result = addTopologyWorkingFaceLoop(geometry, loop);
  return result.applied ? geometry.faces.length - 1 : result.message;
}

/**
 * Works out where an edge end is cut on each of the edge's two faces.
 *
 * @param geometry Working geometry.
 * @param vertex Edge end.
 * @param partner Other end of the edge.
 * @param faces The edge's two faces.
 * @param width Chamfer width.
 * @returns Corner plan, or null when the width does not fit.
 */
function planCorner(
  geometry: TopologyWorkingGeometry,
  vertex: number,
  partner: number,
  faces: readonly number[],
  width: number,
): BevelCorner | null {
  const slides = faces.map((faceIndex) => {
    const neighbour = otherNeighbour(geometry.faces[faceIndex]!, vertex, partner);
    const origin = geometry.positions[vertex]!;
    const toward = geometry.positions[neighbour]!.clone().sub(origin);
    const along = geometry.positions[partner]!.clone().sub(origin).normalize();
    const sine = toward.clone().normalize().cross(along).length();
    const distance = width / Math.max(1e-6, sine);
    if (distance >= toward.length() * 0.999) return null;
    return { neighbour, position: origin.clone().add(toward.normalize().multiplyScalar(distance)) };
  });
  if (!slides[0] || !slides[1]) return null;
  return { vertex, first: slides[0], second: slides[1] };
}

/**
 * Cuts one edge end: the two edge faces take the slid points, and the faces
 * around the far side of the corner are updated to match.
 *
 * @param geometry Working geometry.
 * @param corner Corner plan.
 * @param first First edge face.
 * @param second Second edge face.
 * @returns New vertex on each face and whether the old vertex stays, or null.
 */
function cutCorner(
  geometry: TopologyWorkingGeometry,
  corner: BevelCorner,
  first: number,
  second: number,
): { first: number; second: number; kept: boolean; vertex: number } | null {
  const { vertex } = corner;
  const outerFirst = findFaceWithEdge(geometry, vertex, corner.first.neighbour, first);
  const outerSecond = findFaceWithEdge(geometry, vertex, corner.second.neighbour, second);
  if (outerFirst < 0 || outerSecond < 0) return null;
  const kept = outerFirst !== outerSecond;
  const onFirst = kept ? geometry.positions.push(corner.first.position.clone()) - 1 : vertex;
  const onSecond = geometry.positions.push(corner.second.position.clone()) - 1;
  const ids = { first: onFirst, second: onSecond };
  slideCorner(geometry, geometry.faces[first]!, corner, 'first', ids.first, false);
  slideCorner(geometry, geometry.faces[second]!, corner, 'second', ids.second, false);
  if (kept) {
    slideCorner(geometry, geometry.faces[outerFirst]!, corner, 'first', ids.first, true);
    slideCorner(geometry, geometry.faces[outerSecond]!, corner, 'second', ids.second, true);
  } else {
    splitCorner(geometry, geometry.faces[outerFirst]!, corner, ids);
    geometry.positions[vertex] = corner.first.position.clone();
  }
  return { first: onFirst, second: onSecond, kept, vertex };
}

/**
 * Puts a slid point into a face, either in place of the corner or next to it on
 * the edge towards the neighbour, carrying the texture along that edge.
 *
 * @param geometry Working geometry with the original corner position.
 * @param face Face to update.
 * @param corner Corner plan.
 * @param side Which slide to use.
 * @param point Vertex index of the slid point.
 * @param insert True to insert beside the corner, false to replace it.
 */
function slideCorner(
  geometry: TopologyWorkingGeometry,
  face: TopologyWorkingFace,
  corner: BevelCorner,
  side: 'first' | 'second',
  point: number,
  insert: boolean,
): void {
  const { neighbour, position } = corner[side];
  const uv = slidUv(geometry, face, corner.vertex, neighbour, position);
  const index = face.vertexIndices.indexOf(corner.vertex);
  if (!insert) {
    face.vertexIndices[index] = point;
    face.cornerUvs[index] = uv;
    return;
  }
  const at = face.vertexIndices[(index + 1) % face.vertexIndices.length] === neighbour ? index + 1 : index;
  face.vertexIndices.splice(at, 0, point);
  face.cornerUvs.splice(at, 0, uv);
}

/**
 * Replaces the corner of the face beyond a three-face corner with both slid
 * points, in the order its edges run.
 *
 * @param geometry Working geometry with the original corner position.
 * @param face Face beyond the corner.
 * @param corner Corner plan.
 * @param ids Vertex index of each slid point.
 */
function splitCorner(
  geometry: TopologyWorkingGeometry,
  face: TopologyWorkingFace,
  corner: BevelCorner,
  ids: { first: number; second: number },
): void {
  const index = face.vertexIndices.indexOf(corner.vertex);
  const count = face.vertexIndices.length;
  const sides: Array<'first' | 'second'> =
    face.vertexIndices[(index + count - 1) % count] === corner.first.neighbour
      ? ['first', 'second']
      : ['second', 'first'];
  const uvs = sides.map((side) => slidUv(geometry, face, corner.vertex, corner[side].neighbour, corner[side].position));
  face.vertexIndices.splice(index, 1, ...sides.map((side) => ids[side]));
  face.cornerUvs.splice(index, 1, ...uvs);
}

/**
 * Interpolates a face's texture coordinate for a point on one of its edges.
 *
 * @param geometry Working geometry with the original corner position.
 * @param face Face that owns the edge.
 * @param vertex Edge start.
 * @param neighbour Edge end.
 * @param point Position on the edge.
 * @returns Interpolated UV.
 */
function slidUv(
  geometry: TopologyWorkingGeometry,
  face: TopologyWorkingFace,
  vertex: number,
  neighbour: number,
  point: THREE.Vector3,
): { u: number; v: number } {
  const start = face.cornerUvs[face.vertexIndices.indexOf(vertex)] ?? { u: 0, v: 0 };
  const end = face.cornerUvs[face.vertexIndices.indexOf(neighbour)] ?? start;
  const full = geometry.positions[vertex]!.distanceTo(geometry.positions[neighbour]!);
  const t = full > 1e-12 ? geometry.positions[vertex]!.distanceTo(point) / full : 0;
  return { u: start.u + (end.u - start.u) * t, v: start.v + (end.v - start.v) * t };
}

/**
 * Returns the face corner next to a vertex that is not the given partner.
 *
 * @param face Face holding the vertex.
 * @param vertex Vertex.
 * @param partner Neighbour to skip.
 * @returns Other neighbour.
 */
function otherNeighbour(face: TopologyWorkingFace, vertex: number, partner: number): number {
  const loop = face.vertexIndices;
  const corner = loop.indexOf(vertex);
  const next = loop[(corner + 1) % loop.length]!;
  return next === partner ? loop[(corner + loop.length - 1) % loop.length]! : next;
}

/**
 * Finds a face other than one given that uses an edge.
 *
 * @param geometry Working geometry.
 * @param a Edge end.
 * @param b Edge end.
 * @param skip Face to leave out.
 * @returns Face index, or -1.
 */
function findFaceWithEdge(geometry: TopologyWorkingGeometry, a: number, b: number, skip: number): number {
  return geometry.faces.findIndex(
    (face, index) => index !== skip && (hasDirectedEdge(face, a, b) || hasDirectedEdge(face, b, a)),
  );
}

/**
 * Returns whether a face runs directly from one vertex to another.
 *
 * @param face Face.
 * @param from Start vertex.
 * @param to End vertex.
 * @returns True when the directed edge is in the face.
 */
function hasDirectedEdge(face: TopologyWorkingFace, from: number, to: number): boolean {
  const loop = face.vertexIndices;
  return loop.some((vertex, corner) => vertex === from && loop[(corner + 1) % loop.length] === to);
}
