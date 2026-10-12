import { describe, expect, it } from 'vitest';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import { applyTopologyLoopCut, previewTopologyLoopCut } from '@/edit/topology/topology_loop_cut.js';
import {
  createTopologyLoopCutLockedBelt,
  loopCutCrossingsIncludeSeed,
} from '@/edit/topology/topology_loop_cut_belt.js';
import { remapLoopCutBeltCrossings } from '@/edit/topology/topology_loop_cut_belt_slide.js';
import {
  clampLoopCutParameterToBelt,
  computeLoopCutBeltParameterRange,
} from '@/edit/topology/topology_loop_cut_belt_range.js';
import { TOPOLOGY_EDGE_SPLIT_PARAMETER_EPSILON } from '@/edit/topology/topology_epsilon.js';
import { brushToWorkingGeometry, workingGeometryToBrush } from '@/edit/topology/topology_working_from_brush.js';
import { findWorkingEdgeParallelToY } from './topology_test_edges.js';
import { topologyWorkingVertexRead } from '@/edit/topology/topology_working_vertex_read.js';

describe('topology_loop_cut_belt', () => {
  it('keeps a cube waist on the four vertical edges after the first click', () => {
    const working = brushToWorkingGeometry(SolidBrushFactory.createCenteredBox(2, 2, 2));
    const edge = requireYEdge(working);
    const preview = previewTopologyLoopCut(working, edge.vertexA, edge.vertexB, 0.5);
    expect(preview?.crossings).toHaveLength(4);
    expect(loopCutCrossingsIncludeSeed(preview?.crossings ?? [], edge)).toBe(true);
    const belt = createTopologyLoopCutLockedBelt(preview?.crossings ?? [], edge.vertexA, edge.vertexB, working);
    expect(belt).not.toBeNull();
    if (!belt) {
      return;
    }
    expect(belt.edges).toHaveLength(4);
    const locked = previewTopologyLoopCut(working, edge.vertexA, edge.vertexB, 0.35, belt.edges);
    expect(locked?.crossings).toHaveLength(4);
    expect(collectCrossingKeys(locked?.crossings ?? []).sort()).toEqual(
      collectCrossingKeys(preview?.crossings ?? []).sort(),
    );
  });

  it('refuses a plane that sits on a cube end cap instead of inventing a side loop', () => {
    const working = brushToWorkingGeometry(SolidBrushFactory.createCenteredBox(2, 2, 2));
    const edge = requireYEdge(working);
    const nearCap = TOPOLOGY_EDGE_SPLIT_PARAMETER_EPSILON * 0.25;
    const preview = previewTopologyLoopCut(working, edge.vertexA, edge.vertexB, nearCap);
    expect(preview).toBeNull();
    expect(applyTopologyLoopCut(working, edge.vertexA, edge.vertexB, nearCap).applied).toBe(false);
  });

  it('clamps slide to the interior belt range so a locked cube cut stays a waist', () => {
    const working = brushToWorkingGeometry(SolidBrushFactory.createCenteredBox(2, 2, 2));
    const edge = requireYEdge(working);
    const preview = previewTopologyLoopCut(working, edge.vertexA, edge.vertexB, 0.5);
    const belt = createTopologyLoopCutLockedBelt(preview?.crossings ?? [], edge.vertexA, edge.vertexB, working);
    expect(belt).not.toBeNull();
    if (!belt) {
      return;
    }
    const range = computeLoopCutBeltParameterRange(working, edge.vertexA, edge.vertexB, belt.edges);
    expect(range).not.toBeNull();
    if (!range) {
      return;
    }
    expect(range.min).toBeGreaterThan(0);
    expect(range.max).toBeLessThan(1);
    const clamped = clampLoopCutParameterToBelt(0, range);
    expect(clamped).toBe(range.min);
    const beforeVertices = working.positions.length;
    const result = applyTopologyLoopCut(working, edge.vertexA, edge.vertexB, clamped, belt.edges);
    expect(result.applied).toBe(true);
    expect(working.positions.length).toBe(beforeVertices + 4);
    expect(newVerticesShareInteriorSeedAxis(working, edge, beforeVertices)).toBe(true);
    const rebuilt = workingGeometryToBrush(working);
    expect(rebuilt).not.toBeNull();
    if (!rebuilt) {
      return;
    }
    const validation = SolidBrushValidator.validate(rebuilt);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((error) => error.includes('share an outward normal'))).toBe(true);
  });

  it('remaps a locked cube belt at unsnapped parameters without dropping the loop', () => {
    const working = brushToWorkingGeometry(SolidBrushFactory.createCenteredBox(2, 2, 2));
    const edge = requireYEdge(working);
    const preview = previewTopologyLoopCut(working, edge.vertexA, edge.vertexB, 0.5);
    const belt = createTopologyLoopCutLockedBelt(preview?.crossings ?? [], edge.vertexA, edge.vertexB, working);
    expect(belt).not.toBeNull();
    if (!belt) {
      return;
    }
    const raw = 0.37;
    const remapped = remapLoopCutBeltCrossings(working, edge.vertexA, edge.vertexB, raw, belt.edges);
    expect(remapped).toHaveLength(4);
    expect(collectCrossingKeys(remapped ?? []).sort()).toEqual(collectCrossingKeys(preview?.crossings ?? []).sort());
    const slid = previewTopologyLoopCut(working, edge.vertexA, edge.vertexB, raw, belt.edges);
    expect(slid?.crossings).toHaveLength(4);
  });
});

/**
 * Finds a Y-parallel cube edge or throws via expect.
 *
 * @param working Working geometry.
 * @returns Seed edge.
 */
function requireYEdge(working: ReturnType<typeof brushToWorkingGeometry>): { vertexA: number; vertexB: number } {
  const edge = findWorkingEdgeParallelToY(working);
  expect(edge).not.toBeNull();
  return edge ?? { vertexA: 0, vertexB: 1 };
}

/**
 * Collects undirected edge keys from crossings.
 *
 * @param crossings Crossings.
 * @returns Keys.
 */
function collectCrossingKeys(crossings: readonly { edgeKey: string }[]): string[] {
  return crossings.map((crossing) => crossing.edgeKey);
}

/**
 * Returns whether newly inserted vertices sit strictly between the seed ends.
 *
 * @param working Mutated geometry.
 * @param edge Seed edge.
 * @param previousVertexCount Vertex count before the cut.
 * @returns True when new vertices are interior along the seed axis.
 */
function newVerticesShareInteriorSeedAxis(
  working: ReturnType<typeof brushToWorkingGeometry>,
  edge: { vertexA: number; vertexB: number },
  previousVertexCount: number,
): boolean {
  const start = topologyWorkingVertexRead(working, edge.vertexA);
  const end = topologyWorkingVertexRead(working, edge.vertexB);
  if (!start || !end) {
    return false;
  }
  const axisMin = Math.min(start.y, end.y);
  const axisMax = Math.max(start.y, end.y);
  for (let index = previousVertexCount; index < working.positions.length; index++) {
    const position = working.positions[index];
    if (!position) {
      return false;
    }
    if (position.y <= axisMin + 1e-6 || position.y >= axisMax - 1e-6) {
      return false;
    }
  }
  return working.positions.length > previousVertexCount;
}
