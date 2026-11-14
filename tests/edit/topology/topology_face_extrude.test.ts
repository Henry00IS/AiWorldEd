import { describe, expect, it } from 'vitest';
import { extrudeTopologyWorkingFaces } from '@/edit/topology/topology_face_extrude.js';
import { topologyFaceAreaVector } from '@/edit/topology/topology_face_region.js';
import {
  topologyTestBox,
  topologyTestFaceCentre,
  topologyTestIsClosedAndConsistent,
  topologyTestVolume,
} from './support/topology_test_geometry.js';

describe('extrudeTopologyWorkingFaces', () => {
  it('pushes a face out along its normal and walls it in', () => {
    const size = 1 + Math.random();
    const distance = 0.2 + Math.random();
    const geometry = topologyTestBox(size);
    const normal = topologyFaceAreaVector(geometry, 1).normalize();
    const centreBefore = topologyTestFaceCentre(geometry, 1);
    expect(extrudeTopologyWorkingFaces(geometry, [1], distance).applied).toBe(true);
    expect(geometry.faces).toHaveLength(10);
    expect(topologyTestFaceCentre(geometry, 1).sub(centreBefore).dot(normal)).toBeCloseTo(distance, 6);
    expect(topologyTestIsClosedAndConsistent(geometry)).toBe(true);
    expect(topologyTestVolume(geometry)).toBeCloseTo(size ** 3 + size * size * distance, 6);
  });

  it('pushes a face into the mesh with a negative distance and keeps the surface closed', () => {
    const size = 1 + Math.random();
    const depth = size * (0.2 + Math.random() * 0.5);
    const geometry = topologyTestBox(size);
    expect(extrudeTopologyWorkingFaces(geometry, [1], -depth).applied).toBe(true);
    expect(topologyTestIsClosedAndConsistent(geometry)).toBe(true);
    expect(topologyTestVolume(geometry)).toBeCloseTo(size ** 3 - size * size * depth, 6);
    const wallNormal = topologyFaceAreaVector(geometry, 6).normalize();
    const towardPocket = topologyTestFaceCentre(geometry, 1).sub(topologyTestFaceCentre(geometry, 6));
    expect(wallNormal.dot(towardPocket)).toBeGreaterThan(0);
  });

  it('moves touching faces together and only walls their shared outline', () => {
    const geometry = topologyTestBox(1);
    expect(extrudeTopologyWorkingFaces(geometry, [1, 4], 0.5).applied).toBe(true);
    expect(geometry.faces).toHaveLength(6 + 6);
    expect(geometry.positions).toHaveLength(8 + 6);
    expect(topologyTestIsClosedAndConsistent(geometry)).toBe(true);
  });

  it('moves touching faces one by one with individual grouping', () => {
    const geometry = topologyTestBox(1);
    expect(extrudeTopologyWorkingFaces(geometry, [1, 4], 0.5, 'individual').applied).toBe(true);
    expect(geometry.faces).toHaveLength(6 + 8);
    expect(geometry.positions).toHaveLength(8 + 8);
  });

  it('keeps the face texture and continues its UVs up the walls', () => {
    const geometry = topologyTestBox(2);
    extrudeTopologyWorkingFaces(geometry, [1], 1);
    for (const wall of geometry.faces.slice(6)) {
      expect(wall.textureId).toBe('t');
      const heightInUv = Math.hypot(
        wall.cornerUvs[3]!.u - wall.cornerUvs[0]!.u,
        wall.cornerUvs[3]!.v - wall.cornerUvs[0]!.v,
      );
      expect(heightInUv).toBeCloseTo(0.5, 6);
    }
  });

  it('refuses a zero distance and an empty selection', () => {
    const geometry = topologyTestBox(1);
    expect(extrudeTopologyWorkingFaces(geometry, [1], 0).applied).toBe(false);
    expect(extrudeTopologyWorkingFaces(geometry, [], 1).applied).toBe(false);
    expect(geometry.faces).toHaveLength(6);
  });
});
