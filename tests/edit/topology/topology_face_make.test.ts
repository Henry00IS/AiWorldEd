import { describe, expect, it } from 'vitest';
import { makeTopologyWorkingFace } from '@/edit/topology/topology_face_make.js';
import type { TopologyWorkingGeometry } from '@/edit/topology/topology_working_geometry.js';
import {
  topologyTestBox,
  topologyTestIsClosedAndConsistent,
  topologyTestVolume,
} from './support/topology_test_geometry.js';

describe('makeTopologyWorkingFace', () => {
  it('closes a box hole from shuffled corners with the winding of its neighbours', () => {
    const size = 1 + Math.random();
    const geometry = openBox(size);
    const result = makeTopologyWorkingFace(geometry, [7, 5, 4, 6]);
    expect(result.applied).toBe(true);
    expect(geometry.faces).toHaveLength(6);
    expect(topologyTestIsClosedAndConsistent(geometry)).toBe(true);
    expect(topologyTestVolume(geometry)).toBeCloseTo(size ** 3, 9);
    expect(geometry.faces[5]!.textureId).toBe('t');
    expect(geometry.faces[5]!.cornerUvs).toHaveLength(4);
  });

  it('builds a triangle on part of a hole, wound against the neighbouring faces', () => {
    const geometry = openBox(1);
    expect(makeTopologyWorkingFace(geometry, [6, 4, 5]).applied).toBe(true);
    const made = geometry.faces[5]!.vertexIndices;
    expect(directedEdges(geometry, 5).every((edge) => !directedEdges(geometry, -1, 5).includes(edge))).toBe(true);
    expect(made).toHaveLength(3);
  });

  it('refuses too few corners, a face that already exists and an edge that would get a third face', () => {
    const geometry = topologyTestBox(1);
    expect(makeTopologyWorkingFace(geometry, [0, 1]).applied).toBe(false);
    expect(makeTopologyWorkingFace(geometry, [4, 5, 6, 7]).applied).toBe(false);
    expect(makeTopologyWorkingFace(geometry, [0, 1, 6]).applied).toBe(false);
    expect(geometry.faces).toHaveLength(6);
  });
});

/**
 * Builds a box without its top face.
 *
 * @param size Edge length.
 * @returns Open box.
 */
function openBox(size: number): TopologyWorkingGeometry {
  const geometry = topologyTestBox(size);
  geometry.faces.splice(1, 1);
  return geometry;
}

/**
 * Lists directed edges of one face, or of every face except one.
 *
 * @param geometry Geometry.
 * @param only Face to read, or -1 for all faces.
 * @param skip Face to leave out when reading all faces.
 * @returns Edge keys `from>to`.
 */
function directedEdges(geometry: TopologyWorkingGeometry, only: number, skip = -1): string[] {
  const keys: string[] = [];
  geometry.faces.forEach((face, index) => {
    if ((only >= 0 && index !== only) || index === skip) return;
    face.vertexIndices.forEach((vertex, corner) => {
      keys.push(`${vertex}>${face.vertexIndices[(corner + 1) % face.vertexIndices.length]}`);
    });
  });
  return keys;
}

describe('makeTopologyWorkingFace texture mapping', () => {
  it('maps the new face without mirroring at the neighbour texel density', () => {
    const geometry = openBox(2);
    makeTopologyWorkingFace(geometry, [4, 5, 6, 7]);
    const face = geometry.faces[5]!;
    const [a, b, , d] = face.cornerUvs;
    const across = (b!.u - a!.u) * (d!.v - a!.v) - (b!.v - a!.v) * (d!.u - a!.u);
    expect(across).toBeGreaterThan(0);
    expect(Math.hypot(b!.u - a!.u, b!.v - a!.v)).toBeCloseTo(1, 9);
  });
});
