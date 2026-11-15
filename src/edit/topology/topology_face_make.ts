import * as THREE from 'three';
import { orderTopologyFaceCorners, topologyCornerPlaneNormal } from './topology_face_make_order.js';
import {
  topologyOperatorApplied,
  topologyOperatorRefused,
  type TopologyOperatorResult,
} from './topology_operator_result.js';
import type { TopologyWorkingFace } from './topology_working_face.js';
import type { TopologyWorkingGeometry } from './topology_working_geometry.js';

/**
 * Adds one face through the given vertices, for example to close a hole or to
 * span two loose edges. The new face is wound against its neighbours so the
 * surface stays consistent, and takes their texture.
 *
 * @param geometry Working geometry mutated in place.
 * @param vertices Corner vertices in any order.
 * @returns Operator result.
 */
export function makeTopologyWorkingFace(
  geometry: TopologyWorkingGeometry,
  vertices: readonly number[],
): TopologyOperatorResult {
  const corners = [...new Set(vertices)].filter((vertex) => geometry.positions[vertex] !== undefined);
  if (corners.length < 3) return topologyOperatorRefused('Make Face needs at least three vertices');
  if (topologyCornerPlaneNormal(geometry, corners).lengthSq() < 0.5) {
    return topologyOperatorRefused('Make Face needs vertices that do not lie on one line');
  }
  return addTopologyWorkingFaceLoop(geometry, orderTopologyFaceCorners(geometry, corners));
}

/**
 * Adds one face along an ordered loop of corners, wound against its neighbours
 * and textured like them.
 *
 * @param geometry Working geometry mutated in place.
 * @param ordered Corners in loop order, either winding.
 * @returns Operator result.
 */
export function addTopologyWorkingFaceLoop(
  geometry: TopologyWorkingGeometry,
  ordered: readonly number[],
): TopologyOperatorResult {
  const loop = windAgainstNeighbours(geometry, [...ordered]);
  const refusal = makeFaceRefusal(geometry, loop);
  if (refusal) return topologyOperatorRefused(refusal);
  geometry.faces.push(buildMadeFace(geometry, loop));
  return topologyOperatorApplied(`Made a face with ${loop.length} corners`);
}

/**
 * Reverses a loop when more of its edges run the same way as an existing face
 * than against it.
 *
 * @param geometry Working geometry.
 * @param loop Ordered corners.
 * @returns Loop in the winding that matches its neighbours.
 */
function windAgainstNeighbours(geometry: TopologyWorkingGeometry, loop: number[]): number[] {
  const directed = directedEdgeCounts(geometry);
  let balance = 0;
  loopEdges(loop).forEach(([from, to]) => {
    balance += (directed.get(`${to}>${from}`) ?? 0) - (directed.get(`${from}>${to}`) ?? 0);
  });
  return balance < 0 ? [...loop].reverse() : loop;
}

/**
 * Explains why a loop cannot become a face.
 *
 * @param geometry Working geometry.
 * @param loop Wound corners.
 * @returns Reason, or null when the face can be made.
 */
function makeFaceRefusal(geometry: TopologyWorkingGeometry, loop: readonly number[]): string | null {
  const key = [...loop].sort((a, b) => a - b).join(',');
  const exists = geometry.faces.some((face) => [...face.vertexIndices].sort((a, b) => a - b).join(',') === key);
  if (exists) return 'Make Face found a face on these vertices already';
  const directed = directedEdgeCounts(geometry);
  const blocked = loopEdges(loop).some(([from, to]) => {
    const total = (directed.get(`${from}>${to}`) ?? 0) + (directed.get(`${to}>${from}`) ?? 0);
    return total >= 2 || (directed.get(`${from}>${to}`) ?? 0) > 0;
  });
  return blocked ? 'Make Face would give an edge more than two faces' : null;
}

/**
 * Counts every directed face edge.
 *
 * @param geometry Working geometry.
 * @returns Counts keyed `from>to`.
 */
function directedEdgeCounts(geometry: TopologyWorkingGeometry): Map<string, number> {
  const counts = new Map<string, number>();
  for (const face of geometry.faces) {
    for (const [from, to] of loopEdges(face.vertexIndices)) {
      counts.set(`${from}>${to}`, (counts.get(`${from}>${to}`) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Lists the directed edges of a closed loop.
 *
 * @param loop Corners.
 * @returns Pairs of from and to.
 */
function loopEdges(loop: readonly number[]): Array<[number, number]> {
  return loop.map((vertex, corner) => [vertex, loop[(corner + 1) % loop.length]!]);
}

/**
 * Builds the new face with a planar UV projection at the texel density and
 * texture of a neighbouring face.
 *
 * @param geometry Working geometry.
 * @param loop Wound corners.
 * @returns New face.
 */
function buildMadeFace(geometry: TopologyWorkingGeometry, loop: number[]): TopologyWorkingFace {
  const neighbour = findNeighbourFace(geometry, loop);
  const density = neighbour ? faceTexelDensity(geometry, neighbour) : 1;
  const origin = geometry.positions[loop[0]!]!;
  const axisU = geometry.positions[loop[1]!]!.clone().sub(origin).normalize();
  const axisV = loopNormal(geometry, loop).cross(axisU);
  const cornerUvs = loop.map((vertex) => {
    const offset = geometry.positions[vertex]!.clone().sub(origin);
    return { u: offset.dot(axisU) * density, v: offset.dot(axisV) * density };
  });
  return { vertexIndices: loop, cornerUvs, textureId: neighbour?.textureId ?? geometry.faces[0]?.textureId ?? '' };
}

/**
 * Returns the unit normal a wound loop faces along.
 *
 * @param geometry Working geometry.
 * @param loop Wound corners.
 * @returns Unit normal.
 */
function loopNormal(geometry: TopologyWorkingGeometry, loop: readonly number[]): THREE.Vector3 {
  const sum = new THREE.Vector3();
  for (const [from, to] of loopEdges(loop)) {
    sum.add(geometry.positions[from]!.clone().cross(geometry.positions[to]!));
  }
  return sum.normalize();
}

/**
 * Finds a face that shares an edge, or failing that a corner, with a loop.
 *
 * @param geometry Working geometry.
 * @param loop Corners.
 * @returns Neighbouring face, or null.
 */
function findNeighbourFace(geometry: TopologyWorkingGeometry, loop: readonly number[]): TopologyWorkingFace | null {
  const edges = new Set(loopEdges(loop).map(([from, to]) => `${to}>${from}`));
  const byEdge = geometry.faces.find((face) => loopEdges(face.vertexIndices).some(([a, b]) => edges.has(`${a}>${b}`)));
  return byEdge ?? geometry.faces.find((face) => face.vertexIndices.some((vertex) => loop.includes(vertex))) ?? null;
}

/**
 * Returns UV units per world unit along a face's longest edge.
 *
 * @param geometry Working geometry.
 * @param face Face to measure.
 * @returns Density, 1 when the face has no usable edge.
 */
function faceTexelDensity(geometry: TopologyWorkingGeometry, face: TopologyWorkingFace): number {
  let best = { world: 0, uv: 0 };
  face.vertexIndices.forEach((vertex, corner) => {
    const next = (corner + 1) % face.vertexIndices.length;
    const world = geometry.positions[vertex]!.distanceTo(geometry.positions[face.vertexIndices[next]!]!);
    const a = face.cornerUvs[corner] ?? { u: 0, v: 0 };
    const b = face.cornerUvs[next] ?? { u: 0, v: 0 };
    if (world > best.world) best = { world, uv: Math.hypot(b.u - a.u, b.v - a.v) };
  });
  return best.world > 1e-9 && best.uv > 1e-9 ? best.uv / best.world : 1;
}
