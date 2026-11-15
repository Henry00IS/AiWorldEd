import * as THREE from 'three';
import { topologyFaceAreaVector } from './topology_face_region.js';
import {
  topologyOperatorApplied,
  topologyOperatorRefused,
  type TopologyOperatorResult,
} from './topology_operator_result.js';
import type { TopologyWorkingGeometry } from './topology_working_geometry.js';

/**
 * Shrinks or fattens the selected faces: every corner moves along the average
 * normal of the selected faces around it, so a selected surface swells out or
 * sinks in without new faces. Faces and their indices are unchanged.
 *
 * @param geometry Working geometry mutated in place.
 * @param faces Faces whose corners move.
 * @param distance Signed distance, in the units normalScale reports; negative
 *   shrinks.
 * @param normalScale Length of one local unit along a local normal.
 * @returns Operator result.
 */
export function fattenTopologyWorkingFaces(
  geometry: TopologyWorkingGeometry,
  faces: readonly number[],
  distance: number,
  normalScale: (localNormal: THREE.Vector3) => number = () => 1,
): TopologyOperatorResult {
  if (Math.abs(distance) < 1e-5) return topologyOperatorRefused('Shrink / Fatten distance is zero');
  const normals = collectCornerNormals(geometry, faces);
  if (normals.size === 0) return topologyOperatorRefused('Shrink / Fatten needs selected faces');
  for (const [vertex, normal] of normals) {
    geometry.positions[vertex]!.addScaledVector(normal, distance / normalScale(normal));
  }
  return topologyOperatorApplied(`Moved ${normals.size} vertex(es) along their normals`);
}

/**
 * Averages the unit normals of the selected faces at each of their corners.
 *
 * @param geometry Working geometry.
 * @param faces Selected faces.
 * @returns Unit normal by vertex; corners without a usable normal are left out.
 */
function collectCornerNormals(geometry: TopologyWorkingGeometry, faces: readonly number[]): Map<number, THREE.Vector3> {
  const sums = new Map<number, THREE.Vector3>();
  for (const index of new Set(faces)) {
    if (!geometry.faces[index]) continue;
    const normal = topologyFaceAreaVector(geometry, index).normalize();
    for (const vertex of geometry.faces[index]!.vertexIndices) {
      sums.set(vertex, (sums.get(vertex) ?? new THREE.Vector3()).add(normal));
    }
  }
  for (const [vertex, sum] of sums) {
    if (sum.lengthSq() < 1e-20) sums.delete(vertex);
    else sum.normalize();
  }
  return sums;
}
