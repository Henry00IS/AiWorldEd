import * as THREE from 'three';
import type { TopologyEdgeEndpoints } from './topology_edge_subdivide.js';
import { topologyExtrudeSideWallUvs } from './topology_face_extrude_uv.js';
import { topologyFaceAreaVector } from './topology_face_region.js';
import {
  topologyOperatorApplied,
  topologyOperatorRefused,
  type TopologyOperatorResult,
} from './topology_operator_result.js';
import type { TopologyWorkingGeometry } from './topology_working_geometry.js';

/** One selected border edge, directed the way its only face runs. */
export interface TopologyBorderEdge {
  /** Edge start in its face's winding. */
  from: number;
  /** Edge end in its face's winding. */
  to: number;
  /** Index of the only face using the edge. */
  face: number;
  /** Corner of that face where the edge starts. */
  corner: number;
}

/** Outcome of extruding edges, with the new outer edges. */
export interface TopologyEdgeExtrudeOutcome {
  /** Whether anything changed, and why not. */
  result: TopologyOperatorResult;
  /** New outer edges as vertex pairs. */
  outerEdges: Array<[number, number]>;
}

/**
 * Finds which of the given edges lie on an open border, used by one face only.
 *
 * @param geometry Working geometry.
 * @param edges Candidate edges.
 * @returns Border edges in their face's winding.
 */
export function collectTopologyBorderEdges(
  geometry: TopologyWorkingGeometry,
  edges: readonly TopologyEdgeEndpoints[],
): TopologyBorderEdge[] {
  const found = new Map<string, TopologyBorderEdge[]>();
  const wanted = new Set(edges.map(({ vertexA, vertexB }) => edgeKey(vertexA, vertexB)));
  geometry.faces.forEach((face, faceIndex) => {
    face.vertexIndices.forEach((from, corner) => {
      const to = face.vertexIndices[(corner + 1) % face.vertexIndices.length]!;
      const key = edgeKey(from, to);
      if (wanted.has(key)) found.set(key, [...(found.get(key) ?? []), { from, to, face: faceIndex, corner }]);
    });
  });
  return [...found.values()].filter((uses) => uses.length === 1).map((uses) => uses[0]!);
}

/**
 * Returns the local direction each border vertex moves when the edges are
 * pulled straight out of their faces, mitred so the strip keeps its width.
 *
 * @param geometry Working geometry.
 * @param borders Border edges.
 * @returns Unit-width offset per vertex.
 */
export function topologyBorderEdgeOffsets(
  geometry: TopologyWorkingGeometry,
  borders: readonly TopologyBorderEdge[],
): Map<number, THREE.Vector3> {
  const outward = new Map<number, THREE.Vector3[]>();
  for (const border of borders) {
    const normal = topologyFaceAreaVector(geometry, border.face).normalize();
    const along = geometry.positions[border.to]!.clone().sub(geometry.positions[border.from]!);
    const out = along.cross(normal).normalize();
    for (const vertex of [border.from, border.to]) outward.set(vertex, [...(outward.get(vertex) ?? []), out]);
  }
  const offsets = new Map<number, THREE.Vector3>();
  for (const [vertex, outs] of outward) {
    const direction = outs.reduce((sum, out) => sum.add(out), new THREE.Vector3()).normalize();
    offsets.set(vertex, direction.multiplyScalar(1 / Math.max(0.2, direction.dot(outs[0]!))));
  }
  return offsets;
}

/**
 * Pulls open border edges straight out of their faces into a new strip of
 * quads, continuing the faces' texture. Edges used by two faces are skipped.
 *
 * @param geometry Working geometry mutated in place.
 * @param edges Selected edges.
 * @param distance Signed width of the strip, in the units normalScale reports.
 * @param normalScale Length of one local unit along a local direction.
 * @returns Outcome with the new outer edges.
 */
export function extrudeTopologyWorkingEdges(
  geometry: TopologyWorkingGeometry,
  edges: readonly TopologyEdgeEndpoints[],
  distance: number,
  normalScale: (localDirection: THREE.Vector3) => number = (direction) => direction.length(),
): TopologyEdgeExtrudeOutcome {
  if (Math.abs(distance) < 1e-5) return { result: topologyOperatorRefused('Extrude distance is zero'), outerEdges: [] };
  const borders = collectTopologyBorderEdges(geometry, edges);
  if (borders.length === 0) {
    return { result: topologyOperatorRefused('Extrude Edges needs edges on an open border'), outerEdges: [] };
  }
  const moved = new Map<number, number>();
  for (const [vertex, offset] of topologyBorderEdgeOffsets(geometry, borders)) {
    const step = offset.clone().multiplyScalar(distance / normalScale(offset.clone().normalize()));
    moved.set(vertex, geometry.positions.push(geometry.positions[vertex]!.clone().add(step)) - 1);
  }
  const outerEdges = borders.map((border) => appendBorderStrip(geometry, border, moved, distance));
  return { result: topologyOperatorApplied(`Extruded ${borders.length} edge(s)`), outerEdges };
}

/**
 * Adds the quad between one border edge and its moved copy.
 *
 * @param geometry Working geometry.
 * @param border Border edge.
 * @param moved Moved copy of each border vertex.
 * @param distance Strip width used to scale the texture.
 * @returns The new outer edge.
 */
function appendBorderStrip(
  geometry: TopologyWorkingGeometry,
  border: TopologyBorderEdge,
  moved: ReadonlyMap<number, number>,
  distance: number,
): [number, number] {
  const face = geometry.faces[border.face]!;
  const [start, end, raisedEnd, raisedStart] = topologyExtrudeSideWallUvs(geometry, face, border.corner, distance);
  const outerFrom = moved.get(border.from)!;
  const outerTo = moved.get(border.to)!;
  geometry.faces.push({
    vertexIndices: [border.to, border.from, outerFrom, outerTo],
    cornerUvs: [end!, start!, raisedStart!, raisedEnd!],
    textureId: face.textureId,
  });
  return [outerFrom, outerTo];
}

/**
 * Builds an undirected edge key.
 *
 * @param a First vertex.
 * @param b Second vertex.
 * @returns Key.
 */
function edgeKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}
