import { describe, expect, it } from 'vitest';
import { fattenTopologyWorkingFaces } from '@/edit/topology/topology_face_fatten.js';
import { topologyTestBox, topologyTestVolume } from './support/topology_test_geometry.js';

describe('fattenTopologyWorkingFaces', () => {
  it('moves a lone face straight along its normal and keeps the topology', () => {
    const distance = 0.1 + Math.random();
    const geometry = topologyTestBox(2);
    const faces = geometry.faces.map((face) => face.vertexIndices.slice());
    expect(fattenTopologyWorkingFaces(geometry, [1], distance).applied).toBe(true);
    for (const vertex of geometry.faces[1]!.vertexIndices)
      expect(geometry.positions[vertex]!.z).toBeCloseTo(1 + distance, 9);
    expect(geometry.faces.map((face) => face.vertexIndices)).toEqual(faces);
  });

  it('pushes every corner of a whole box out along its averaged normal', () => {
    const geometry = topologyTestBox(2);
    fattenTopologyWorkingFaces(geometry, [0, 1, 2, 3, 4, 5], 0.5);
    const corner = geometry.positions[6]!;
    const expected = 1 + 0.5 / Math.sqrt(3);
    expect(corner.toArray().map((value) => Number(value.toFixed(9)))).toEqual(
      [expected, expected, expected].map((value) => Number(value.toFixed(9))),
    );
    expect(topologyTestVolume(geometry)).toBeCloseTo((2 * expected) ** 3, 9);
  });

  it('shrinks with a negative distance and scales by the normal scale', () => {
    const geometry = topologyTestBox(2);
    fattenTopologyWorkingFaces(geometry, [1], -1, (normal) => normal.length() * 2);
    expect(geometry.positions[geometry.faces[1]!.vertexIndices[0]!]!.z).toBeCloseTo(0.5, 9);
  });

  it('refuses a zero distance or no faces', () => {
    expect(fattenTopologyWorkingFaces(topologyTestBox(1), [1], 0).applied).toBe(false);
    expect(fattenTopologyWorkingFaces(topologyTestBox(1), [], 1).applied).toBe(false);
  });
});
