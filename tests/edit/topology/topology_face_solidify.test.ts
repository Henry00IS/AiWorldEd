import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { solidifyTopologyWorkingFaces } from '@/edit/topology/topology_face_solidify.js';
import type { TopologyWorkingGeometry } from '@/edit/topology/topology_working_geometry.js';
import {
  topologyTestBox,
  topologyTestIsClosedAndConsistent,
  topologyTestVolume,
} from './support/topology_test_geometry.js';

describe('solidifyTopologyWorkingFaces', () => {
  it('turns a loose panel into a closed slab in front of it', () => {
    const thickness = 0.1 + Math.random();
    const geometry = panel();
    expect(solidifyTopologyWorkingFaces(geometry, [0, 1], thickness).applied).toBe(true);
    expect(topologyTestIsClosedAndConsistent(geometry)).toBe(true);
    expect(topologyTestVolume(geometry)).toBeCloseTo(2 * thickness, 9);
    expect(geometry.positions[geometry.faces[0]!.vertexIndices[0]!]!.z).toBeCloseTo(thickness, 9);
  });

  it('grows the slab behind the panel for a negative thickness', () => {
    const geometry = panel();
    solidifyTopologyWorkingFaces(geometry, [0, 1], -0.5);
    expect(topologyTestIsClosedAndConsistent(geometry)).toBe(true);
    expect(topologyTestVolume(geometry)).toBeCloseTo(1, 9);
    const zs = geometry.faces.flatMap((face) => face.vertexIndices.map((vertex) => geometry.positions[vertex]!.z));
    expect(Math.min(...zs)).toBeCloseTo(-0.5, 9);
    expect(Math.max(...zs)).toBeCloseTo(0, 9);
  });

  it('refuses faces of a closed mesh', () => {
    const geometry = topologyTestBox(1);
    expect(solidifyTopologyWorkingFaces(geometry, [1], 0.2).applied).toBe(false);
    expect(solidifyTopologyWorkingFaces(geometry, [0, 1, 2, 3, 4, 5], 0.2).applied).toBe(false);
  });
});

/**
 * Builds a loose 2 by 1 panel of two quads facing +Z.
 *
 * @returns Panel geometry.
 */
function panel(): TopologyWorkingGeometry {
  const points = [
    [0, 0],
    [1, 0],
    [2, 0],
    [2, 1],
    [1, 1],
    [0, 1],
  ];
  const uvs = () => [0, 1, 2, 3].map((index) => ({ u: index, v: 0 }));
  return {
    positions: points.map(([x, y]) => new THREE.Vector3(x, y, 0)),
    faces: [
      { vertexIndices: [0, 1, 4, 5], cornerUvs: uvs(), textureId: 't' },
      { vertexIndices: [1, 2, 3, 4], cornerUvs: uvs(), textureId: 't' },
    ],
  };
}
