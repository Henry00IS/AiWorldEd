import { describe, expect, it } from 'vitest';
import { insetTopologyWorkingFaceRegions } from '@/edit/topology/topology_face_inset_region.js';
import { topologyFaceAreaVector } from '@/edit/topology/topology_face_region.js';
import {
  topologyTestBox,
  topologyTestFaceCentre,
  topologyTestIsClosedAndConsistent,
  topologyTestVolume,
} from './support/topology_test_geometry.js';

describe('insetTopologyWorkingFaceRegions', () => {
  it('shrinks a face by the thickness inside its plane and rings it with quads', () => {
    const size = 1 + Math.random();
    const thickness = size * (0.05 + Math.random() * 0.3);
    const geometry = topologyTestBox(size);
    expect(insetTopologyWorkingFaceRegions(geometry, [1], thickness, 0, 'region').applied).toBe(true);
    expect(geometry.faces).toHaveLength(10);
    const inner = geometry.faces[1]!.vertexIndices.map((vertex) => geometry.positions[vertex]!);
    for (let corner = 0; corner < 4; corner++) {
      expect(inner[corner]!.distanceTo(inner[(corner + 1) % 4]!)).toBeCloseTo(size - 2 * thickness, 6);
      expect(inner[corner]!.z).toBeCloseTo(size / 2, 9);
    }
    expect(topologyTestIsClosedAndConsistent(geometry)).toBe(true);
    expect(topologyTestVolume(geometry)).toBeCloseTo(size ** 3, 6);
  });

  it('raises or sinks the inset face by the depth', () => {
    const geometry = topologyTestBox(2);
    const normal = topologyFaceAreaVector(geometry, 1).normalize();
    const before = topologyTestFaceCentre(geometry, 1);
    insetTopologyWorkingFaceRegions(geometry, [1], 0.5, -0.25, 'region');
    expect(topologyTestFaceCentre(geometry, 1).sub(before).dot(normal)).toBeCloseTo(-0.25, 9);
    expect(topologyTestIsClosedAndConsistent(geometry)).toBe(true);
  });

  it('insets touching faces as one region with a single ring around their outline', () => {
    const geometry = topologyTestBox(2);
    expect(insetTopologyWorkingFaceRegions(geometry, [1, 4], 0.25, 0, 'region').applied).toBe(true);
    expect(geometry.faces).toHaveLength(6 + 6);
    expect(topologyTestIsClosedAndConsistent(geometry)).toBe(true);
  });

  it('insets touching faces one by one with individual grouping', () => {
    const geometry = topologyTestBox(2);
    expect(insetTopologyWorkingFaceRegions(geometry, [1, 4], 0.25, 0, 'individual').applied).toBe(true);
    expect(geometry.faces).toHaveLength(6 + 8);
    expect(topologyTestIsClosedAndConsistent(geometry)).toBe(true);
  });

  it('refuses a negative thickness, nothing to do, and an empty selection', () => {
    const geometry = topologyTestBox(1);
    expect(insetTopologyWorkingFaceRegions(geometry, [1], -0.1, 0, 'region').applied).toBe(false);
    expect(insetTopologyWorkingFaceRegions(geometry, [1], 0, 0, 'region').applied).toBe(false);
    expect(insetTopologyWorkingFaceRegions(geometry, [], 0.1, 0, 'region').applied).toBe(false);
    expect(geometry.faces).toHaveLength(6);
  });
});

describe('insetTopologyWorkingFaceRegions UVs', () => {
  it('pulls the inset face UVs in by the same share as its corners', () => {
    const size = 2;
    const thickness = 0.25 + Math.random() * 0.5;
    const geometry = topologyTestBox(size);
    insetTopologyWorkingFaceRegions(geometry, [1], thickness, 0, 'region');
    const uvs = geometry.faces[1]!.cornerUvs;
    expect(Math.abs(uvs[1]!.u - uvs[0]!.u) + Math.abs(uvs[1]!.v - uvs[0]!.v)).toBeCloseTo(
      1 - (2 * thickness) / size,
      6,
    );
  });
});
