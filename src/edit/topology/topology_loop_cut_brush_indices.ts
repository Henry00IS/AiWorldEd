import type { Vector3 } from 'three';
import { findSolidBrushWeldedVertexIndex } from '@/solid/brush/solid_brush_vertex_weld.js';
import type { TopologyWorkingGeometry } from './topology_working_geometry.js';

/**
 * Copies inserted loop-cut positions in loop order.
 *
 * @param geometry Working geometry that contains the inserted vertices.
 * @param insertedVertexIndices Inserted vertex indices.
 * @returns Cloned positions, or null when an index is missing.
 */
export function cloneLoopCutInsertedPositions(
  geometry: TopologyWorkingGeometry,
  insertedVertexIndices: readonly number[],
): Vector3[] | null {
  const positions: Vector3[] = [];
  for (const vertexIndex of insertedVertexIndices) {
    const position = geometry.positions[vertexIndex];
    if (!position) {
      return null;
    }
    positions.push(position.clone());
  }
  return positions;
}

/**
 * Maps loop positions onto brush vertices within the weld distance.
 *
 * @param positions Positions in loop order.
 * @param brushVertices Vertices of the rebuilt brush.
 * @returns Brush indices in the same order, or null when any position misses.
 */
export function mapLoopCutPositionsToBrushVertexIndices(
  positions: readonly Vector3[],
  brushVertices: readonly Vector3[],
): number[] | null {
  const indices: number[] = [];
  for (const position of positions) {
    const index = findSolidBrushWeldedVertexIndex(brushVertices, position);
    if (index === null) {
      return null;
    }
    indices.push(index);
  }
  return indices;
}

/**
 * Chooses component indices for a committed loop cut.
 *
 * @param targetKind Live target kind.
 * @param insertedVertexIndices Working-geometry indices in loop order.
 * @param insertedPositions Positions of those indices.
 * @param brushVertices Rebuilt brush vertices. Unused for a mesh.
 * @returns Indices to select, or null when a brush position has no match.
 */
export function resolveLoopCutComponentIndices(
  targetKind: 'brush' | 'mesh',
  insertedVertexIndices: readonly number[],
  insertedPositions: readonly Vector3[],
  brushVertices: readonly Vector3[],
): readonly number[] | null {
  if (targetKind === 'mesh') {
    return insertedVertexIndices;
  }
  return mapLoopCutPositionsToBrushVertexIndices(insertedPositions, brushVertices);
}
