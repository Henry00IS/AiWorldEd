import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { insetTopologyWorkingFaces } from '@/edit/topology/topology_face_inset.js';
import type { TopologyWorkingGeometry } from '@/edit/topology/topology_working_geometry.js';

/**
 * Builds a unit square split into two quads side by side.
 *
 * @returns Working geometry.
 */
function strip(): TopologyWorkingGeometry {
  const positions = [
    [0, 0],
    [1, 0],
    [2, 0],
    [2, 1],
    [1, 1],
    [0, 1],
  ].map(([x, y]) => new THREE.Vector3(x, y, 0));
  const uv = (count: number) => Array.from({ length: count }, (_, i) => ({ u: i, v: 0 }));
  return {
    positions,
    faces: [
      { vertexIndices: [0, 1, 4, 5], cornerUvs: uv(4), textureId: 'a' },
      { vertexIndices: [1, 2, 3, 4], cornerUvs: uv(4), textureId: 'b' },
    ],
  };
}

/**
 * Returns the signed area normal of a face.
 *
 * @param geometry Geometry.
 * @param face Face index.
 * @returns Area vector.
 */
function areaVector(geometry: TopologyWorkingGeometry, face: number): THREE.Vector3 {
  const loop = geometry.faces[face]!.vertexIndices.map((index) => geometry.positions[index]!);
  const sum = new THREE.Vector3();
  loop.forEach((point, i) => sum.add(point.clone().cross(loop[(i + 1) % loop.length]!)));
  return sum.multiplyScalar(0.5);
}

describe('inset faces', () => {
  it('shrinks the face in place and rings it with quads that keep the winding and texture', () => {
    const geometry = strip();
    const result = insetTopologyWorkingFaces(geometry, [0], 0.25);
    expect(result.applied).toBe(true);
    expect(geometry.positions).toHaveLength(10);
    expect(geometry.faces).toHaveLength(6);
    expect(areaVector(geometry, 0).z).toBeCloseTo(0.75 * 0.75, 6);
    let total = 0;
    for (const index of [0, 2, 3, 4, 5]) {
      const area = areaVector(geometry, index);
      expect(area.z).toBeGreaterThan(0);
      total += area.z;
      expect(geometry.faces[index]!.textureId).toBe('a');
      expect(geometry.faces[index]!.cornerUvs).toHaveLength(geometry.faces[index]!.vertexIndices.length);
    }
    expect(total).toBeCloseTo(1, 6);
    expect(geometry.faces[1]!.vertexIndices).toEqual([1, 2, 3, 4]);
  });

  it('insets several faces each on its own and refuses bad amounts', () => {
    const geometry = strip();
    expect(insetTopologyWorkingFaces(geometry, [0, 1], 0.5).applied).toBe(true);
    expect(geometry.faces).toHaveLength(10);
    expect(insetTopologyWorkingFaces(strip(), [0], 0).applied).toBe(false);
    expect(insetTopologyWorkingFaces(strip(), [0], 1).applied).toBe(false);
    expect(insetTopologyWorkingFaces(strip(), [], 0.25).applied).toBe(false);
    expect(insetTopologyWorkingFaces(strip(), [9], 0.25).applied).toBe(false);
  });
});
