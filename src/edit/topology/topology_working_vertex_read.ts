import type { Vector3 } from 'three';
import type { TopologyWorkingGeometry } from './topology_working_geometry.js';

/**
 * Reads a vertex position when the index is in range.
 *
 * @param geometry Working geometry.
 * @param vertexIndex Vertex index.
 * @returns Position, or null when the index is out of range.
 */
export function topologyWorkingVertexRead(geometry: TopologyWorkingGeometry, vertexIndex: number): Vector3 | null {
  if (vertexIndex < 0 || vertexIndex >= geometry.positions.length) {
    return null;
  }
  const position = geometry.positions[vertexIndex];
  if (!position) {
    return null;
  }
  return position;
}
