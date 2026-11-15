import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  pokeTopologyWorkingFaces,
  triangulateTopologyWorkingFaces,
} from '@/edit/topology/topology_face_triangulate.js';
import type { TopologyWorkingGeometry } from '@/edit/topology/topology_working_geometry.js';
import {
  topologyTestBox,
  topologyTestIsClosedAndConsistent,
  topologyTestVolume,
} from './support/topology_test_geometry.js';

describe('triangulateTopologyWorkingFaces', () => {
  it('splits box quads into triangles and keeps the box closed', () => {
    const size = 1 + Math.random();
    const geometry = topologyTestBox(size);
    const outcome = triangulateTopologyWorkingFaces(geometry, [0, 1, 2, 3, 4, 5]);
    expect(outcome.faces).toHaveLength(12);
    expect(geometry.faces.every((face) => face.vertexIndices.length === 3)).toBe(true);
    expect(topologyTestIsClosedAndConsistent(geometry)).toBe(true);
    expect(topologyTestVolume(geometry)).toBeCloseTo(size ** 3, 9);
  });

  it('keeps a concave face inside its outline', () => {
    const geometry = lShape();
    triangulateTopologyWorkingFaces(geometry, [0]);
    const total = geometry.faces.reduce((sum, _face, index) => sum + signedArea(geometry, index), 0);
    expect(geometry.faces).toHaveLength(4);
    expect(total).toBeCloseTo(3, 9);
    expect(geometry.faces.every((_face, index) => signedArea(geometry, index) > 0)).toBe(true);
  });

  it('refuses triangles', () => {
    const geometry = topologyTestBox(1);
    triangulateTopologyWorkingFaces(geometry, [0]);
    expect(triangulateTopologyWorkingFaces(geometry, [0]).result.applied).toBe(false);
  });
});

describe('pokeTopologyWorkingFaces', () => {
  it('fans a box face from its centre and keeps the box closed', () => {
    const geometry = topologyTestBox(2);
    const outcome = pokeTopologyWorkingFaces(geometry, [1]);
    expect(outcome.faces).toHaveLength(4);
    expect(geometry.positions[8]!.toArray()).toEqual([0, 0, 1]);
    expect(geometry.faces[1]!.cornerUvs[2]).toEqual({ u: 0.5, v: 0.5 });
    expect(topologyTestIsClosedAndConsistent(geometry)).toBe(true);
    expect(topologyTestVolume(geometry)).toBeCloseTo(8, 9);
  });
});

/**
 * Builds an L-shaped face of area 3 facing +Z.
 *
 * @returns Geometry with one concave face.
 */
function lShape(): TopologyWorkingGeometry {
  const points = [
    [0, 0],
    [2, 0],
    [2, 1],
    [1, 1],
    [1, 2],
    [0, 2],
  ];
  return {
    positions: points.map(([x, y]) => new THREE.Vector3(x, y, 0)),
    faces: [
      { vertexIndices: [0, 1, 2, 3, 4, 5], cornerUvs: points.map(([u, v]) => ({ u: u!, v: v! })), textureId: 't' },
    ],
  };
}

/**
 * Returns the signed area of a face seen from +Z.
 *
 * @param geometry Geometry.
 * @param index Face index.
 * @returns Area, positive when counter-clockwise.
 */
function signedArea(geometry: TopologyWorkingGeometry, index: number): number {
  const loop = geometry.faces[index]!.vertexIndices.map((vertex) => geometry.positions[vertex]!);
  return loop.reduce((sum, point, corner) => {
    const next = loop[(corner + 1) % loop.length]!;
    return sum + (point.x * next.y - next.x * point.y) / 2;
  }, 0);
}
