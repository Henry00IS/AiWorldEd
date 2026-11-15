import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { smoothTopologyWorkingVertices } from '@/edit/topology/topology_vertex_smooth.js';
import type { TopologyWorkingGeometry } from '@/edit/topology/topology_working_geometry.js';

describe('smoothTopologyWorkingVertices', () => {
  it('pulls a raised centre half way back to its neighbours', () => {
    const height = 0.5 + Math.random();
    const geometry = grid(height);
    expect(smoothTopologyWorkingVertices(geometry, [4]).applied).toBe(true);
    expect(geometry.positions[4]!.toArray()).toEqual([1, 1, height / 2]);
    expect(geometry.positions[0]!.toArray()).toEqual([0, 0, 0]);
  });

  it('reads old positions so the selection order does not matter', () => {
    const first = grid(1);
    const second = grid(1);
    smoothTopologyWorkingVertices(first, [4, 1]);
    smoothTopologyWorkingVertices(second, [1, 4]);
    expect(first.positions.map((point) => point.toArray())).toEqual(second.positions.map((point) => point.toArray()));
    expect(first.positions[1]!.z).toBeCloseTo(1 / 6, 9);
  });

  it('refuses when the vertices are already even', () => {
    expect(smoothTopologyWorkingVertices(grid(0), [4]).applied).toBe(false);
    expect(smoothTopologyWorkingVertices(grid(1), []).applied).toBe(false);
  });
});

/**
 * Builds a flat 3 by 3 vertex grid of four quads with the centre raised.
 *
 * @param height Centre height.
 * @returns Grid geometry.
 */
function grid(height: number): TopologyWorkingGeometry {
  const positions = [...Array(9).keys()].map((index) => new THREE.Vector3(index % 3, Math.floor(index / 3), 0));
  positions[4]!.z = height;
  const uvs = () => [0, 1, 2, 3].map((index) => ({ u: index, v: 0 }));
  const quad = (corner: number) => ({
    vertexIndices: [corner, corner + 1, corner + 4, corner + 3],
    cornerUvs: uvs(),
    textureId: 't',
  });
  return { positions, faces: [quad(0), quad(1), quad(3), quad(4)] };
}
