import { describe, expect, it } from 'vitest';
import type { Vector3 } from 'three';
import { EditorComponentMode } from '@/types/editor_component_mode.js';
import { buildComponentEdgeKey } from '@/edit/component/component_selection_entry.js';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SOLID_BRUSH_VERTEX_WELD_EPSILON } from '@/solid/brush/solid_brush_vertex_weld.js';
import { applyTopologyLoopCut } from '@/edit/topology/topology_loop_cut.js';
import {
  cloneLoopCutInsertedPositions,
  resolveLoopCutComponentIndices,
} from '@/edit/topology/topology_loop_cut_brush_indices.js';
import { buildLoopCutComponentSelection } from '@/edit/topology/topology_loop_cut_selection.js';
import { brushToWorkingGeometry, workingGeometryToBrush } from '@/edit/topology/topology_working_from_brush.js';
import type { TopologyWorkingGeometry } from '@/edit/topology/topology_working_geometry.js';
import { findWorkingEdgeParallelToX } from './topology_test_edges.js';

describe('topology_loop_cut_brush_indices', () => {
  it('selects rebuilt brush vertices at the cut instead of working indices', () => {
    const cut = cutBoxAlongX(0.4);
    const positions = cloneLoopCutInsertedPositions(cut.working, cut.inserted);
    expect(positions).not.toBeNull();
    if (!positions) {
      return;
    }
    const mapped = resolveLoopCutComponentIndices('brush', cut.inserted, positions, cut.brush.vertices);
    expect(mapped).not.toBeNull();
    if (!mapped) {
      return;
    }
    expect(verticesMatchPositions(cut.brush.vertices, mapped, positions)).toBe(true);
    expect(verticesMatchPositions(cut.brush.vertices, cut.inserted, positions)).toBe(false);
    expect(loopEdgesExistOnBrush(cut.brush, mapped)).toBe(true);
    expect(resolveLoopCutComponentIndices('mesh', cut.inserted, positions, cut.brush.vertices)).toEqual(cut.inserted);
  });
});

/**
 * Cuts a box through an edge parallel to X and rebuilds the brush.
 *
 * @param parameter Slide parameter.
 * @returns Working geometry, inserted indices, and the rebuilt brush.
 */
function cutBoxAlongX(parameter: number): {
  working: TopologyWorkingGeometry;
  inserted: readonly number[];
  brush: SolidBrush;
} {
  const working = brushToWorkingGeometry(SolidBrushFactory.createCenteredBox(2, 3, 4));
  const edge = findWorkingEdgeParallelToX(working);
  expect(edge).not.toBeNull();
  if (!edge) {
    throw new Error('box has no edge parallel to X');
  }
  const result = applyTopologyLoopCut(working, edge.vertexA, edge.vertexB, parameter);
  expect(result.applied).toBe(true);
  const brush = workingGeometryToBrush(working);
  expect(brush).not.toBeNull();
  if (!brush) {
    throw new Error('cut box did not rebuild');
  }
  return { working, inserted: result.insertedVertexIndices, brush };
}

/**
 * Returns whether each index points at the matching position.
 *
 * @param vertices Brush vertices.
 * @param indices Indices to check.
 * @param positions Expected positions in the same order.
 * @returns True when every index matches.
 */
function verticesMatchPositions(
  vertices: readonly Vector3[],
  indices: readonly number[],
  positions: readonly Vector3[],
): boolean {
  if (indices.length !== positions.length || indices.length === 0) {
    return false;
  }
  for (let index = 0; index < indices.length; index += 1) {
    if (!indexMatchesPosition(vertices, indices[index], positions[index])) {
      return false;
    }
  }
  return true;
}

/**
 * Returns whether one brush vertex sits on one position.
 *
 * @param vertices Brush vertices.
 * @param vertexIndex Vertex index.
 * @param position Expected position.
 * @returns True when the vertex is within the weld distance.
 */
function indexMatchesPosition(
  vertices: readonly Vector3[],
  vertexIndex: number | undefined,
  position: Vector3 | undefined,
): boolean {
  if (vertexIndex === undefined || !position) {
    return false;
  }
  const vertex = vertices[vertexIndex];
  if (!vertex) {
    return false;
  }
  return vertex.distanceTo(position) <= SOLID_BRUSH_VERTEX_WELD_EPSILON;
}

/**
 * Returns whether the loop ring exists on the rebuilt brush.
 *
 * @param brush Rebuilt brush.
 * @param inserted Brush vertex indices in loop order.
 * @returns True when every ring edge bounds a face.
 */
function loopEdgesExistOnBrush(brush: SolidBrush, inserted: readonly number[]): boolean {
  const edges = buildLoopCutComponentSelection('brush:cut', EditorComponentMode.EDGE, inserted);
  if (edges.length !== inserted.length) {
    return false;
  }
  for (const edge of edges) {
    if (!brushFaceContainsEdgeKey(brush, edge.componentKey)) {
      return false;
    }
  }
  return true;
}

/**
 * Returns whether a brush face contains an undirected edge.
 *
 * @param brush Rebuilt brush.
 * @param edgeKey Edge key.
 * @returns True when a face boundary matches.
 */
function brushFaceContainsEdgeKey(brush: SolidBrush, edgeKey: string): boolean {
  for (const face of brush.faces) {
    if (polygonContainsEdgeKey(brush.getFaceVertexIndices(face), edgeKey)) {
      return true;
    }
  }
  return false;
}

/**
 * Returns whether a polygon contains an undirected edge.
 *
 * @param vertexIndices Polygon corners.
 * @param edgeKey Edge key.
 * @returns True when a boundary matches.
 */
function polygonContainsEdgeKey(vertexIndices: readonly number[], edgeKey: string): boolean {
  const count = vertexIndices.length;
  for (let index = 0; index < count; index += 1) {
    const start = vertexIndices[index];
    const end = vertexIndices[(index + 1) % count];
    if (start !== undefined && end !== undefined && buildComponentEdgeKey(start, end) === edgeKey) {
      return true;
    }
  }
  return false;
}
