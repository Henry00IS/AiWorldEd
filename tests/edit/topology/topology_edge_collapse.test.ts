import { describe, expect, it } from 'vitest';
import { collapseTopologyWorkingEdges } from '@/edit/topology/topology_edge_collapse.js';
import { topologyTestBox, topologyTestIsClosedAndConsistent } from './support/topology_test_geometry.js';

describe('collapseTopologyWorkingEdges', () => {
  it('merges an edge into its midpoint and keeps the box closed', () => {
    const geometry = topologyTestBox(2);
    expect(collapseTopologyWorkingEdges(geometry, [{ vertexA: 1, vertexB: 2 }]).applied).toBe(true);
    expect(geometry.positions).toHaveLength(7);
    expect(geometry.positions.some((point) => point.distanceTo({ x: 1, y: 0, z: -1 } as never) < 1e-9)).toBe(true);
    expect(geometry.faces).toHaveLength(6);
    expect(geometry.faces.every((face) => face.vertexIndices.length >= 3)).toBe(true);
    expect(topologyTestIsClosedAndConsistent(geometry)).toBe(true);
  });

  it('collapses a connected run into one point and separate edges into one point each', () => {
    const run = topologyTestBox(2);
    collapseTopologyWorkingEdges(run, [
      { vertexA: 0, vertexB: 1 },
      { vertexA: 1, vertexB: 2 },
    ]);
    expect(run.positions).toHaveLength(6);
    const apart = topologyTestBox(2);
    collapseTopologyWorkingEdges(apart, [
      { vertexA: 0, vertexB: 1 },
      { vertexA: 6, vertexB: 7 },
    ]);
    expect(apart.positions).toHaveLength(6);
    expect(topologyTestIsClosedAndConsistent(apart)).toBe(true);
  });

  it('refuses without edges', () => {
    expect(collapseTopologyWorkingEdges(topologyTestBox(1), []).applied).toBe(false);
  });
});
