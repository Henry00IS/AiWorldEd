import { describe, expect, it } from 'vitest';
import { subdivideTopologyWorkingEdges } from '@/edit/topology/topology_edge_subdivide.js';
import {
  topologyTestBox,
  topologyTestIsClosedAndConsistent,
  topologyTestVolume,
} from './support/topology_test_geometry.js';

describe('subdivideTopologyWorkingEdges', () => {
  it('splits an edge into evenly spaced pieces on both faces and keeps the box closed', () => {
    const size = 1 + Math.random();
    const geometry = topologyTestBox(size);
    const outcome = subdivideTopologyWorkingEdges(geometry, [{ vertexA: 0, vertexB: 1 }], 3);
    expect(outcome.result.applied).toBe(true);
    expect(geometry.positions.length).toBe(11);
    expect(outcome.pieces).toHaveLength(4);
    const lengths = outcome.pieces.map(([a, b]) => geometry.positions[a]!.distanceTo(geometry.positions[b]!));
    for (const length of lengths) expect(length).toBeCloseTo(size / 4, 9);
    expect(geometry.faces[0]!.vertexIndices).toHaveLength(7);
    expect(geometry.faces[2]!.vertexIndices).toHaveLength(7);
    expect(topologyTestIsClosedAndConsistent(geometry)).toBe(true);
    expect(topologyTestVolume(geometry)).toBeCloseTo(size ** 3, 9);
  });

  it('chains the pieces from one end of the edge to the other', () => {
    const geometry = topologyTestBox(2);
    const { pieces } = subdivideTopologyWorkingEdges(geometry, [{ vertexA: 1, vertexB: 0 }], 1);
    expect(pieces[0]![0]).toBe(1);
    expect(pieces[1]![1]).toBe(0);
    expect(pieces[0]![1]).toBe(pieces[1]![0]);
    expect(geometry.positions[pieces[0]![1]]!.x).toBeCloseTo(0, 9);
  });

  it('refuses edges that no face uses and cut counts below one', () => {
    const geometry = topologyTestBox(1);
    expect(subdivideTopologyWorkingEdges(geometry, [{ vertexA: 0, vertexB: 6 }], 1).result.applied).toBe(false);
    expect(subdivideTopologyWorkingEdges(geometry, [{ vertexA: 0, vertexB: 1 }], 0).result.applied).toBe(false);
    expect(geometry.positions.length).toBe(8);
  });

  it('splits several edges, including two that share a corner', () => {
    const geometry = topologyTestBox(1);
    const outcome = subdivideTopologyWorkingEdges(
      geometry,
      [
        { vertexA: 0, vertexB: 1 },
        { vertexA: 1, vertexB: 2 },
      ],
      1,
    );
    expect(outcome.pieces).toHaveLength(4);
    expect(geometry.faces[0]!.vertexIndices).toHaveLength(6);
    expect(topologyTestIsClosedAndConsistent(geometry)).toBe(true);
  });
});
