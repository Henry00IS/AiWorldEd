import type { Vector3 } from 'three';
import { TOPOLOGY_VERTEX_EQUAL_EPSILON } from './topology_epsilon.js';
import { collectCoincidentSampleGroups, type CoincidentPositionSample } from './topology_coincident_grid.js';
import type { TopologyWorkingGeometry } from './topology_working_geometry.js';
import { topologyWorkingVertexRead } from './topology_working_vertex_read.js';

/** One cluster of distinct topology vertices that share a position. */
export interface TopologyCoincidentCluster {
  /** Vertex indices in the cluster. */
  vertexIndices: number[];
  /** Shared local position. */
  position: Vector3;
}

/**
 * Finds clusters of distinct vertices that share a position.
 *
 * @param geometry Working geometry.
 * @param epsilon Merge radius.
 * @returns Clusters with at least two vertices.
 */
export function detectTopologyCoincidentClusters(
  geometry: TopologyWorkingGeometry,
  epsilon: number = TOPOLOGY_VERTEX_EQUAL_EPSILON,
): TopologyCoincidentCluster[] {
  const samples = collectPositionSamples(geometry);
  const groups = collectCoincidentSampleGroups(samples, epsilon);
  return groupsToClusters(geometry, groups);
}

/**
 * Finds one representative packed position per coincident cluster.
 *
 * @param positions Packed xyz positions.
 * @param epsilon Merge radius.
 * @returns Representative positions.
 */
export function detectPackedCoincidentPositions(
  positions: Float32Array,
  epsilon: number = TOPOLOGY_VERTEX_EQUAL_EPSILON,
): CoincidentPositionSample[] {
  const samples = packedPositionsToSamples(positions);
  const groups = collectCoincidentSampleGroups(samples, epsilon);
  const representatives: CoincidentPositionSample[] = [];
  for (const group of groups) {
    const index = group[0];
    const sample = index === undefined ? undefined : samples[index];
    if (sample) {
      representatives.push(sample);
    }
  }
  return representatives;
}

/**
 * Copies working positions into grid samples.
 *
 * @param geometry Working geometry.
 * @returns Samples aligned with vertex indices.
 */
function collectPositionSamples(geometry: TopologyWorkingGeometry): CoincidentPositionSample[] {
  const samples: CoincidentPositionSample[] = [];
  for (let index = 0; index < geometry.positions.length; index++) {
    const position = topologyWorkingVertexRead(geometry, index);
    samples.push(position ? { x: position.x, y: position.y, z: position.z } : { x: 0, y: 0, z: 0 });
  }
  return samples;
}

/**
 * Converts packed positions into grid samples.
 *
 * @param positions Packed xyz positions.
 * @returns Samples aligned with vertex indices.
 */
function packedPositionsToSamples(positions: Float32Array): CoincidentPositionSample[] {
  const samples: CoincidentPositionSample[] = [];
  for (let index = 0; index + 2 < positions.length; index += 3) {
    samples.push({ x: positions[index] ?? 0, y: positions[index + 1] ?? 0, z: positions[index + 2] ?? 0 });
  }
  return samples;
}

/**
 * Builds cluster records from index groups.
 *
 * @param geometry Working geometry.
 * @param groups Index groups.
 * @returns Cluster records.
 */
function groupsToClusters(geometry: TopologyWorkingGeometry, groups: readonly number[][]): TopologyCoincidentCluster[] {
  const clusters: TopologyCoincidentCluster[] = [];
  for (const group of groups) {
    const cluster = clusterFromGroup(geometry, group);
    if (cluster) {
      clusters.push(cluster);
    }
  }
  return clusters;
}

/**
 * Builds one cluster when its seed position exists.
 *
 * @param geometry Working geometry.
 * @param group Vertex indices.
 * @returns Cluster, or null when the seed is missing.
 */
function clusterFromGroup(
  geometry: TopologyWorkingGeometry,
  group: readonly number[],
): TopologyCoincidentCluster | null {
  const seed = group[0];
  if (seed === undefined) {
    return null;
  }
  const position = topologyWorkingVertexRead(geometry, seed);
  if (!position) {
    return null;
  }
  return { vertexIndices: group.slice(), position: position.clone() };
}
