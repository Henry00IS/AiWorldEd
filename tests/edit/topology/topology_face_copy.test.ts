import { describe, expect, it } from 'vitest';
import { duplicateTopologyWorkingFaces, flipTopologyWorkingFaces } from '@/edit/topology/topology_face_copy.js';
import {
  topologyTestBox,
  topologyTestIsClosedAndConsistent,
  topologyTestVolume,
} from './support/topology_test_geometry.js';

describe('flipTopologyWorkingFaces', () => {
  it('reverses the winding and the UVs with it', () => {
    const geometry = topologyTestBox(1);
    const before = geometry.faces[1]!.cornerUvs.map((uv) => ({ ...uv }));
    expect(flipTopologyWorkingFaces(geometry, [1]).applied).toBe(true);
    expect(geometry.faces[1]!.vertexIndices).toEqual([7, 6, 5, 4]);
    expect(geometry.faces[1]!.cornerUvs).toEqual([...before].reverse());
    expect(topologyTestIsClosedAndConsistent(geometry)).toBe(false);
  });

  it('turns a whole box inside out and refuses an empty selection', () => {
    const size = 1 + Math.random();
    const geometry = topologyTestBox(size);
    flipTopologyWorkingFaces(geometry, [0, 1, 2, 3, 4, 5]);
    expect(topologyTestIsClosedAndConsistent(geometry)).toBe(true);
    expect(topologyTestVolume(geometry)).toBeCloseTo(-(size ** 3), 9);
    expect(flipTopologyWorkingFaces(geometry, [42]).applied).toBe(false);
  });
});

describe('duplicateTopologyWorkingFaces', () => {
  it('copies faces onto shared new vertices and leaves the source alone', () => {
    const geometry = topologyTestBox(1);
    const outcome = duplicateTopologyWorkingFaces(geometry, [1, 2]);
    expect(outcome.copies).toEqual([6, 7]);
    expect(geometry.positions).toHaveLength(8 + 6);
    const [top, front] = outcome.copies.map((index) => geometry.faces[index]!.vertexIndices);
    expect(top!.every((vertex) => vertex >= 8)).toBe(true);
    expect(top!.filter((vertex) => front!.includes(vertex))).toHaveLength(2);
    expect(geometry.positions[top![0]!]!.equals(geometry.positions[4]!)).toBe(true);
    expect(geometry.faces.slice(0, 6).every((face) => face.vertexIndices.every((vertex) => vertex < 8))).toBe(true);
  });

  it('refuses an empty selection', () => {
    expect(duplicateTopologyWorkingFaces(topologyTestBox(1), []).result.applied).toBe(false);
  });
});
