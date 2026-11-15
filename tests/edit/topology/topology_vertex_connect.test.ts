import { describe, expect, it } from 'vitest';
import { connectTopologyWorkingVertices } from '@/edit/topology/topology_vertex_connect.js';
import { subdivideTopologyWorkingEdges } from '@/edit/topology/topology_edge_subdivide.js';
import {
  topologyTestBox,
  topologyTestIsClosedAndConsistent,
  topologyTestVolume,
} from './support/topology_test_geometry.js';

describe('connectTopologyWorkingVertices', () => {
  it('splits a quad along its diagonal and keeps the box closed', () => {
    const size = 1 + Math.random();
    const geometry = topologyTestBox(size);
    const outcome = connectTopologyWorkingVertices(geometry, [4, 6]);
    expect(outcome.result.applied).toBe(true);
    expect(outcome.edges).toEqual([[4, 6]]);
    expect(geometry.faces).toHaveLength(7);
    expect(geometry.faces[1]!.vertexIndices).toHaveLength(3);
    expect(topologyTestIsClosedAndConsistent(geometry)).toBe(true);
    expect(topologyTestVolume(geometry)).toBeCloseTo(size ** 3, 9);
  });

  it('connects the midpoints of two opposite edges across a face', () => {
    const geometry = topologyTestBox(1);
    const first = subdivideTopologyWorkingEdges(geometry, [{ vertexA: 4, vertexB: 5 }], 1).pieces[0]![1];
    const second = subdivideTopologyWorkingEdges(geometry, [{ vertexA: 6, vertexB: 7 }], 1).pieces[0]![1];
    const outcome = connectTopologyWorkingVertices(geometry, [first, second]);
    expect(outcome.edges).toHaveLength(1);
    expect(
      geometry.faces.filter((face) => face.vertexIndices.includes(first) && face.vertexIndices.includes(second)),
    ).toHaveLength(2);
    expect(topologyTestIsClosedAndConsistent(geometry)).toBe(true);
  });

  it('cuts one face several times when it holds more selected corners', () => {
    const geometry = topologyTestBox(1);
    const mids = subdivideTopologyWorkingEdges(
      geometry,
      [
        { vertexA: 4, vertexB: 5 },
        { vertexA: 5, vertexB: 6 },
        { vertexA: 6, vertexB: 7 },
      ],
      1,
    )
      .pieces.filter((_piece, index) => index % 2 === 0)
      .map((piece) => piece[1]);
    const outcome = connectTopologyWorkingVertices(geometry, mids);
    expect(outcome.edges).toHaveLength(3);
    expect(topologyTestIsClosedAndConsistent(geometry)).toBe(true);
  });

  it('refuses vertices that already share an edge or no face', () => {
    const geometry = topologyTestBox(1);
    expect(connectTopologyWorkingVertices(geometry, [4, 5]).result.applied).toBe(false);
    expect(connectTopologyWorkingVertices(geometry, [0, 6]).result.applied).toBe(false);
    expect(connectTopologyWorkingVertices(geometry, [4]).result.applied).toBe(false);
    expect(geometry.faces).toHaveLength(6);
  });
});
