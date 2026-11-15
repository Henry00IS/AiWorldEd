import { describe, expect, it } from 'vitest';
import { bevelTopologyWorkingEdges } from '@/edit/topology/topology_edge_bevel.js';
import { connectTopologyWorkingVertices } from '@/edit/topology/topology_vertex_connect.js';
import {
  topologyTestBox,
  topologyTestIsClosedAndConsistent,
  topologyTestVolume,
} from './support/topology_test_geometry.js';

describe('bevelTopologyWorkingEdges', () => {
  it('chamfers a box edge with a flat face and keeps the box closed', () => {
    const size = 1 + Math.random();
    const width = 0.1 + Math.random() * 0.3;
    const geometry = topologyTestBox(size);
    const outcome = bevelTopologyWorkingEdges(geometry, [{ vertexA: 4, vertexB: 5 }], width);
    expect(outcome.result.applied).toBe(true);
    expect(outcome.faces).toEqual([6]);
    expect(geometry.positions).toHaveLength(10);
    expect(geometry.faces[6]!.vertexIndices).toHaveLength(4);
    expect(topologyTestIsClosedAndConsistent(geometry)).toBe(true);
    expect(topologyTestVolume(geometry)).toBeCloseTo(size ** 3 - (width * width * size) / 2, 9);
  });

  it('chamfers two parallel edges of one face', () => {
    const geometry = topologyTestBox(2);
    const outcome = bevelTopologyWorkingEdges(
      geometry,
      [
        { vertexA: 4, vertexB: 5 },
        { vertexA: 6, vertexB: 7 },
      ],
      0.25,
    );
    expect(outcome.faces).toHaveLength(2);
    expect(topologyTestIsClosedAndConsistent(geometry)).toBe(true);
    expect(topologyTestVolume(geometry)).toBeCloseTo(8 - (2 * (0.25 * 0.25 * 2)) / 2, 9);
  });

  it('keeps a corner vertex where more than three faces meet', () => {
    const geometry = topologyTestBox(1);
    connectTopologyWorkingVertices(geometry, [4, 6]);
    const outcome = bevelTopologyWorkingEdges(geometry, [{ vertexA: 4, vertexB: 5 }], 0.1);
    expect(outcome.result.applied).toBe(true);
    expect(geometry.faces[outcome.faces[0]!]!.vertexIndices).toContain(4);
    expect(topologyTestIsClosedAndConsistent(geometry)).toBe(true);
  });

  it('refuses touching edges, a too wide bevel and a zero width', () => {
    const geometry = topologyTestBox(1);
    const touching = [
      { vertexA: 4, vertexB: 5 },
      { vertexA: 5, vertexB: 6 },
    ];
    expect(bevelTopologyWorkingEdges(geometry, touching, 0.1).result.applied).toBe(false);
    expect(bevelTopologyWorkingEdges(geometry, [{ vertexA: 4, vertexB: 5 }], 2).result.applied).toBe(false);
    expect(bevelTopologyWorkingEdges(geometry, [{ vertexA: 4, vertexB: 5 }], 0).result.applied).toBe(false);
    expect(geometry.faces).toHaveLength(6);
  });
});
