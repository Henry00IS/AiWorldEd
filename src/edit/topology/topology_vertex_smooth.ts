import * as THREE from 'three';
import {
  topologyOperatorApplied,
  topologyOperatorRefused,
  type TopologyOperatorResult,
} from './topology_operator_result.js';
import type { TopologyWorkingGeometry } from './topology_working_geometry.js';

/** Shortest move that counts as a change. */
const TOPOLOGY_SMOOTH_EPSILON = 1e-9;

/**
 * Relaxes the given vertices towards the average of their edge neighbours,
 * evening out bumps and uneven spacing. Every vertex reads its neighbours' old
 * positions, so the result does not depend on selection order.
 *
 * @param geometry Working geometry mutated in place.
 * @param vertices Vertices to relax.
 * @param factor Share of the way towards the neighbour average, 0 to 1.
 * @returns Operator result.
 */
export function smoothTopologyWorkingVertices(
  geometry: TopologyWorkingGeometry,
  vertices: readonly number[],
  factor = 0.5,
): TopologyOperatorResult {
  const neighbours = collectTopologyVertexNeighbours(geometry);
  const targets = new Map<number, THREE.Vector3>();
  for (const vertex of new Set(vertices)) {
    const around = neighbours.get(vertex);
    if (!around || around.size === 0) continue;
    const average = new THREE.Vector3();
    for (const neighbour of around) average.add(geometry.positions[neighbour]!);
    average.divideScalar(around.size);
    const moved = geometry.positions[vertex]!.clone().lerp(average, factor);
    if (moved.distanceTo(geometry.positions[vertex]!) > TOPOLOGY_SMOOTH_EPSILON) targets.set(vertex, moved);
  }
  if (targets.size === 0) return topologyOperatorRefused('Smooth Vertices found nothing to even out');
  for (const [vertex, position] of targets) geometry.positions[vertex]!.copy(position);
  return topologyOperatorApplied(`Smoothed ${targets.size} vertex(es)`);
}

/**
 * Maps each vertex to the vertices it shares a face edge with.
 *
 * @param geometry Working geometry.
 * @returns Neighbour sets by vertex.
 */
function collectTopologyVertexNeighbours(geometry: TopologyWorkingGeometry): Map<number, Set<number>> {
  const neighbours = new Map<number, Set<number>>();
  const link = (from: number, to: number) => {
    const set = neighbours.get(from) ?? new Set<number>();
    neighbours.set(from, set.add(to));
  };
  for (const face of geometry.faces) {
    face.vertexIndices.forEach((vertex, corner) => {
      const next = face.vertexIndices[(corner + 1) % face.vertexIndices.length]!;
      link(vertex, next);
      link(next, vertex);
    });
  }
  return neighbours;
}
