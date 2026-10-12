import { describe, expect, it } from 'vitest';
import { EditorComponentMode } from '@/types/editor_component_mode.js';
import { buildComponentEdgeKey } from '@/edit/component/component_selection_entry.js';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { applyTopologyLoopCut } from '@/edit/topology/topology_loop_cut.js';
import { buildLoopCutComponentSelection } from '@/edit/topology/topology_loop_cut_selection.js';
import { brushToWorkingGeometry } from '@/edit/topology/topology_working_from_brush.js';
import type { TopologyWorkingGeometry } from '@/edit/topology/topology_working_geometry.js';
import { findWorkingEdgeParallelToY } from './topology_test_edges.js';

describe('topology_loop_cut_selection', () => {
  it('selects the inserted ring in vertex mode and the new edges in edge mode', () => {
    const parameter = 0.5;
    const working = brushToWorkingGeometry(SolidBrushFactory.createCenteredBox(2, 2, 2));
    const edge = findWorkingEdgeParallelToY(working);
    expect(edge).not.toBeNull();
    if (!edge) {
      return;
    }
    const beforeCount = working.positions.length;
    const result = applyTopologyLoopCut(working, edge.vertexA, edge.vertexB, parameter);
    expect(result.applied).toBe(true);
    expect(result.insertedVertexIndices.length).toBe(working.positions.length - beforeCount);
    expectInsertedVerticesShareCutHeight(working, edge, parameter, result.insertedVertexIndices);
    const vertices = buildLoopCutComponentSelection('brush', EditorComponentMode.VERTEX, result.insertedVertexIndices);
    const edges = buildLoopCutComponentSelection('brush', EditorComponentMode.EDGE, result.insertedVertexIndices);
    expect(vertices).toHaveLength(result.insertedVertexIndices.length);
    expect(edges).toHaveLength(result.insertedVertexIndices.length);
    expect(vertices.every((entry) => entry.kind === 'vertex')).toBe(true);
    expect(edges.every((entry) => entry.kind === 'edge')).toBe(true);
    expect(buildLoopCutComponentSelection('brush', EditorComponentMode.FACE, result.insertedVertexIndices)).toEqual([]);
    expect(
      everyEdgeExistsOnAFace(
        working,
        edges.map((entry) => entry.componentKey),
      ),
    ).toBe(true);
    expect(
      edgeEndpointsAreSelectedVertices(
        vertices.map((entry) => entry.componentKey),
        edges,
      ),
    ).toBe(true);
  });
});

/**
 * Checks that inserted vertices sit on the seed edge's cut plane.
 *
 * @param geometry Working geometry after the cut.
 * @param edge Seed edge.
 * @param parameter Cut parameter.
 * @param inserted Inserted vertex indices.
 */
function expectInsertedVerticesShareCutHeight(
  geometry: TopologyWorkingGeometry,
  edge: { vertexA: number; vertexB: number },
  parameter: number,
  inserted: readonly number[],
): void {
  const start = geometry.positions[edge.vertexA];
  const end = geometry.positions[edge.vertexB];
  expect(start).toBeTruthy();
  expect(end).toBeTruthy();
  if (!start || !end) {
    return;
  }
  const expectedY = start.y + (end.y - start.y) * parameter;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  for (const index of inserted) {
    const position = geometry.positions[index];
    expect(position).toBeTruthy();
    if (!position) {
      continue;
    }
    expect(position.y).toBeCloseTo(expectedY);
    minX = Math.min(minX, position.x);
    maxX = Math.max(maxX, position.x);
  }
  expect(maxX - minX).toBeGreaterThan(0);
}

/**
 * Returns whether every edge key is a face boundary.
 *
 * @param geometry Working geometry.
 * @param edgeKeys Edge keys.
 * @returns True when each key is present.
 */
function everyEdgeExistsOnAFace(geometry: TopologyWorkingGeometry, edgeKeys: readonly string[]): boolean {
  for (const edgeKey of edgeKeys) {
    if (!faceContainsEdgeKey(geometry, edgeKey)) {
      return false;
    }
  }
  return edgeKeys.length > 0;
}

/**
 * Returns whether one edge key bounds a face.
 *
 * @param geometry Working geometry.
 * @param edgeKey Edge key.
 * @returns True when a face contains the edge.
 */
function faceContainsEdgeKey(geometry: TopologyWorkingGeometry, edgeKey: string): boolean {
  for (const face of geometry.faces) {
    if (polygonContainsEdgeKey(face.vertexIndices, edgeKey)) {
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
    if (start === undefined || end === undefined) {
      continue;
    }
    if (buildComponentEdgeKey(start, end) === edgeKey) {
      return true;
    }
  }
  return false;
}

/**
 * Returns whether every selected edge joins two selected vertices.
 *
 * @param vertexKeys Selected vertex keys.
 * @param edges Selected edge entries.
 * @returns True when both endpoints are selected vertices.
 */
function edgeEndpointsAreSelectedVertices(
  vertexKeys: readonly string[],
  edges: readonly { componentKey: string }[],
): boolean {
  const selected = new Set(vertexKeys);
  for (const edge of edges) {
    const parts = edge.componentKey.split(':');
    const start = parts[0];
    const end = parts[1];
    if (!start || !end || !selected.has(start) || !selected.has(end)) {
      return false;
    }
  }
  return edges.length > 0;
}
