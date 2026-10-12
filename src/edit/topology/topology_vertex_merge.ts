import * as THREE from 'three';
import { compactTopologyWorkingGeometry } from './topology_working_compact.js';
import type { TopologyWorkingFace } from './topology_working_face.js';
import type { TopologyWorkingGeometry } from './topology_working_geometry.js';
import { topologyWorkingVertexRead } from './topology_working_vertex_read.js';
import { TOPOLOGY_VERTEX_EQUAL_EPSILON } from './topology_epsilon.js';
import type { TopologyVertexMergeMode } from './topology_vertex_merge_mode.js';
import {
  topologyOperatorApplied,
  topologyOperatorRefused,
  type TopologyOperatorResult,
} from './topology_operator_result.js';

/**
 * Merges selected vertices according to a merge mode.
 *
 * @param geometry Working geometry mutated in place.
 * @param vertexIndices Selected vertex indices in selection order.
 * @param mode Merge mode.
 * @param distanceEpsilon Cluster radius for by-distance.
 * @returns Operator result.
 */
export function mergeTopologyWorkingVertices(
  geometry: TopologyWorkingGeometry,
  vertexIndices: readonly number[],
  mode: TopologyVertexMergeMode,
  distanceEpsilon: number = TOPOLOGY_VERTEX_EQUAL_EPSILON,
): TopologyOperatorResult {
  if (mode === 'by_distance') {
    return mergeVerticesByDistance(geometry, vertexIndices, distanceEpsilon);
  }
  if (vertexIndices.length < 2) {
    return topologyOperatorRefused('Select at least two vertices to merge');
  }
  const target = resolveMergeTargetPosition(geometry, vertexIndices, mode);
  if (!target) {
    return topologyOperatorRefused('Cannot resolve a merge position');
  }
  weldVerticesToTarget(geometry, vertexIndices, target);
  compactTopologyWorkingGeometry(geometry);
  return topologyOperatorApplied();
}

/**
 * Resolves the target point for a selected-vertex merge.
 *
 * @param geometry Working geometry.
 * @param vertexIndices Selected vertices.
 * @param mode Merge mode.
 * @returns Target position, or null when unresolved.
 */
function resolveMergeTargetPosition(
  geometry: TopologyWorkingGeometry,
  vertexIndices: readonly number[],
  mode: TopologyVertexMergeMode,
): THREE.Vector3 | null {
  if (mode === 'at_first') {
    return readFirstSelectedPosition(geometry, vertexIndices);
  }
  if (mode === 'at_last') {
    return readLastSelectedPosition(geometry, vertexIndices);
  }
  return averageSelectedPositions(geometry, vertexIndices);
}

/**
 * Reads the first selected vertex position.
 *
 * @param geometry Working geometry.
 * @param vertexIndices Selected vertices.
 * @returns Position, or null.
 */
function readFirstSelectedPosition(
  geometry: TopologyWorkingGeometry,
  vertexIndices: readonly number[],
): THREE.Vector3 | null {
  const first = vertexIndices[0];
  if (first === undefined) {
    return null;
  }
  const position = topologyWorkingVertexRead(geometry, first);
  return position ? position.clone() : null;
}

/**
 * Reads the last selected vertex position.
 *
 * @param geometry Working geometry.
 * @param vertexIndices Selected vertices.
 * @returns Position, or null.
 */
function readLastSelectedPosition(
  geometry: TopologyWorkingGeometry,
  vertexIndices: readonly number[],
): THREE.Vector3 | null {
  const last = vertexIndices[vertexIndices.length - 1];
  if (last === undefined) {
    return null;
  }
  const position = topologyWorkingVertexRead(geometry, last);
  return position ? position.clone() : null;
}

/**
 * Averages selected vertex positions.
 *
 * @param geometry Working geometry.
 * @param vertexIndices Selected vertices.
 * @returns Centroid, or null.
 */
function averageSelectedPositions(
  geometry: TopologyWorkingGeometry,
  vertexIndices: readonly number[],
): THREE.Vector3 | null {
  const sum = new THREE.Vector3();
  let count = 0;
  for (const vertexIndex of vertexIndices) {
    const position = topologyWorkingVertexRead(geometry, vertexIndex);
    if (!position) {
      continue;
    }
    sum.add(position);
    count += 1;
  }
  if (count === 0) {
    return null;
  }
  return sum.multiplyScalar(1 / count);
}

/**
 * Snaps listed vertices onto a target and remaps them to the first index.
 *
 * @param geometry Working geometry.
 * @param vertexIndices Vertices to weld.
 * @param target Merge position.
 */
function weldVerticesToTarget(
  geometry: TopologyWorkingGeometry,
  vertexIndices: readonly number[],
  target: THREE.Vector3,
): void {
  const survivor = vertexIndices[0];
  if (survivor === undefined) {
    return;
  }
  const survivorPosition = topologyWorkingVertexRead(geometry, survivor);
  if (survivorPosition) {
    survivorPosition.copy(target);
  }
  const remap = buildSelectedVertexRemap(vertexIndices, survivor);
  remapAllFaceVertices(geometry.faces, remap);
  collapseDuplicateFaceCorners(geometry.faces);
}

/**
 * Maps every selected vertex onto the survivor index.
 *
 * @param vertexIndices Selected vertices.
 * @param survivor Survivor index.
 * @returns Remap of selected vertices.
 */
function buildSelectedVertexRemap(vertexIndices: readonly number[], survivor: number): Map<number, number> {
  const remap = new Map<number, number>();
  for (const vertexIndex of vertexIndices) {
    remap.set(vertexIndex, survivor);
  }
  return remap;
}

/**
 * Rewrites face corners through a vertex remap.
 *
 * @param faces Faces to rewrite.
 * @param remap Vertex remap.
 */
function remapAllFaceVertices(faces: TopologyWorkingFace[], remap: ReadonlyMap<number, number>): void {
  for (const face of faces) {
    for (let corner = 0; corner < face.vertexIndices.length; corner++) {
      const oldIndex = face.vertexIndices[corner];
      if (oldIndex === undefined) {
        continue;
      }
      const next = remap.get(oldIndex);
      if (next !== undefined) {
        face.vertexIndices[corner] = next;
      }
    }
  }
}

/**
 * Removes consecutive duplicate corners created by welding.
 *
 * @param faces Faces to clean.
 */
function collapseDuplicateFaceCorners(faces: TopologyWorkingFace[]): void {
  for (const face of faces) {
    collapseOneFaceDuplicateCorners(face);
  }
}

/**
 * Removes consecutive (and wrap-around) duplicate corners on one face.
 *
 * @param face Face to clean.
 */
function collapseOneFaceDuplicateCorners(face: TopologyWorkingFace): void {
  let corner = 0;
  while (corner < face.vertexIndices.length && face.vertexIndices.length > 0) {
    const nextIndex = (corner + 1) % face.vertexIndices.length;
    const current = face.vertexIndices[corner];
    const next = face.vertexIndices[nextIndex];
    if (current !== next) {
      corner += 1;
      continue;
    }
    face.vertexIndices.splice(nextIndex, 1);
    spliceCornerUvIfPresent(face, nextIndex);
  }
}

/**
 * Removes a corner UV when the index is in range.
 *
 * @param face Face to update.
 * @param cornerIndex UV corner index.
 */
function spliceCornerUvIfPresent(face: TopologyWorkingFace, cornerIndex: number): void {
  if (cornerIndex < 0 || cornerIndex >= face.cornerUvs.length) {
    return;
  }
  face.cornerUvs.splice(cornerIndex, 1);
}

/**
 * Welds every cluster of selected vertices closer than the distance epsilon.
 *
 * @param geometry Working geometry.
 * @param vertexIndices Selected vertices, or all vertices when empty.
 * @param distanceEpsilon Cluster radius.
 * @returns Operator result.
 */
function mergeVerticesByDistance(
  geometry: TopologyWorkingGeometry,
  vertexIndices: readonly number[],
  distanceEpsilon: number,
): TopologyOperatorResult {
  const candidates = vertexIndices.length > 0 ? vertexIndices : allVertexIndices(geometry);
  const clusters = clusterVerticesByDistance(geometry, candidates, distanceEpsilon);
  let mergedAny = false;
  for (const cluster of clusters) {
    if (cluster.length < 2) {
      continue;
    }
    const target = averageSelectedPositions(geometry, cluster);
    if (!target) {
      continue;
    }
    weldVerticesToTarget(geometry, cluster, target);
    mergedAny = true;
  }
  if (!mergedAny) {
    return topologyOperatorRefused('No vertices within merge distance');
  }
  compactTopologyWorkingGeometry(geometry);
  return topologyOperatorApplied();
}

/**
 * Lists every vertex index in working geometry.
 *
 * @param geometry Working geometry.
 * @returns Index list.
 */
function allVertexIndices(geometry: TopologyWorkingGeometry): number[] {
  const indices: number[] = [];
  for (let index = 0; index < geometry.positions.length; index++) {
    indices.push(index);
  }
  return indices;
}

/**
 * Clusters vertices whose positions are within the distance epsilon.
 *
 * @param geometry Working geometry.
 * @param vertexIndices Candidates.
 * @param distanceEpsilon Cluster radius.
 * @returns Clusters.
 */
function clusterVerticesByDistance(
  geometry: TopologyWorkingGeometry,
  vertexIndices: readonly number[],
  distanceEpsilon: number,
): number[][] {
  const remaining = vertexIndices.slice();
  const clusters: number[][] = [];
  while (remaining.length > 0) {
    const seed = remaining.shift();
    if (seed === undefined) {
      break;
    }
    clusters.push(growDistanceCluster(geometry, seed, remaining, distanceEpsilon));
  }
  return clusters;
}

/**
 * Grows one by-distance cluster from a seed vertex.
 *
 * @param geometry Working geometry.
 * @param seed Seed vertex.
 * @param remaining Remaining candidates (mutated).
 * @param distanceEpsilon Cluster radius.
 * @returns Cluster including the seed.
 */
function growDistanceCluster(
  geometry: TopologyWorkingGeometry,
  seed: number,
  remaining: number[],
  distanceEpsilon: number,
): number[] {
  const cluster = [seed];
  const seedPosition = topologyWorkingVertexRead(geometry, seed);
  if (!seedPosition) {
    return cluster;
  }
  for (let index = remaining.length - 1; index >= 0; index--) {
    const candidate = remaining[index];
    if (candidate === undefined) {
      continue;
    }
    if (!vertexWithinDistance(geometry, candidate, seedPosition, distanceEpsilon)) {
      continue;
    }
    cluster.push(candidate);
    remaining.splice(index, 1);
  }
  return cluster;
}

/**
 * Returns whether a vertex lies within a radius of a seed position.
 *
 * @param geometry Working geometry.
 * @param vertexIndex Candidate vertex.
 * @param seedPosition Seed position.
 * @param distanceEpsilon Radius.
 * @returns True when inside the radius.
 */
function vertexWithinDistance(
  geometry: TopologyWorkingGeometry,
  vertexIndex: number,
  seedPosition: THREE.Vector3,
  distanceEpsilon: number,
): boolean {
  const position = topologyWorkingVertexRead(geometry, vertexIndex);
  if (!position) {
    return false;
  }
  return position.distanceTo(seedPosition) <= distanceEpsilon;
}
