import { describe, expect, it } from 'vitest';
import { joinTopologyWorkingTriangles } from '@/edit/topology/topology_face_join_triangles.js';
import {
  pokeTopologyWorkingFaces,
  triangulateTopologyWorkingFaces,
} from '@/edit/topology/topology_face_triangulate.js';
import {
  topologyTestBox,
  topologyTestIsClosedAndConsistent,
  topologyTestVolume,
} from './support/topology_test_geometry.js';

describe('joinTopologyWorkingTriangles', () => {
  it('turns a triangulated box back into six quads', () => {
    const size = 1 + Math.random();
    const geometry = topologyTestBox(size);
    triangulateTopologyWorkingFaces(geometry, [0, 1, 2, 3, 4, 5]);
    const outcome = joinTopologyWorkingTriangles(geometry, [...geometry.faces.keys()]);
    expect(outcome.result.applied).toBe(true);
    expect(geometry.faces).toHaveLength(6);
    expect(outcome.faces).toHaveLength(6);
    expect(geometry.faces.every((face) => face.vertexIndices.length === 4)).toBe(true);
    expect(topologyTestIsClosedAndConsistent(geometry)).toBe(true);
    expect(topologyTestVolume(geometry)).toBeCloseTo(size ** 3, 9);
  });

  it('leaves triangles across a corner alone and renumbers later faces', () => {
    const geometry = topologyTestBox(1);
    triangulateTopologyWorkingFaces(geometry, [0, 1]);
    const top = geometry.faces.flatMap((face, index) =>
      face.vertexIndices.every((vertex) => vertex >= 4) ? [index] : [],
    );
    const outcome = joinTopologyWorkingTriangles(geometry, [0, ...top]);
    expect(outcome.result.applied).toBe(true);
    expect(geometry.faces).toHaveLength(7);
    expect(outcome.faces).toHaveLength(2);
    expect(topologyTestIsClosedAndConsistent(geometry)).toBe(true);
  });

  it('refuses a fan whose pairs would be concave or bent', () => {
    const geometry = topologyTestBox(1);
    pokeTopologyWorkingFaces(geometry, [1]);
    expect(joinTopologyWorkingTriangles(geometry, [...geometry.faces.keys()]).result.applied).toBe(false);
  });
});
