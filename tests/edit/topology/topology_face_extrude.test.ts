import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { extrudeTopologyWorkingFaces } from '@/edit/topology/topology_face_extrude.js';
import { topologyFaceAreaVector } from '@/edit/topology/topology_face_region.js';
import type { TopologyWorkingGeometry } from '@/edit/topology/topology_working_geometry.js';

/**
 * Builds a closed box of quads with outward winding.
 *
 * @param size Edge length.
 * @returns Working geometry.
 */
function box(size: number): TopologyWorkingGeometry {
  const h = size / 2;
  const positions = [
    [-h, -h, -h],
    [h, -h, -h],
    [h, h, -h],
    [-h, h, -h],
    [-h, -h, h],
    [h, -h, h],
    [h, h, h],
    [-h, h, h],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const loops = [
    [3, 2, 1, 0],
    [4, 5, 6, 7],
    [0, 1, 5, 4],
    [2, 3, 7, 6],
    [1, 2, 6, 5],
    [3, 0, 4, 7],
  ];
  const uvs = [
    { u: 0, v: 0 },
    { u: 1, v: 0 },
    { u: 1, v: 1 },
    { u: 0, v: 1 },
  ];
  return {
    positions,
    faces: loops.map((loop) => ({ vertexIndices: loop, cornerUvs: uvs.map((uv) => ({ ...uv })), textureId: 't' })),
  };
}

/**
 * Returns the signed volume enclosed by the faces.
 *
 * @param geometry Closed geometry.
 * @returns Volume, positive for outward winding.
 */
function volume(geometry: TopologyWorkingGeometry): number {
  let sum = 0;
  geometry.faces.forEach((face) => {
    const a = geometry.positions[face.vertexIndices[0]!]!;
    for (let corner = 1; corner + 1 < face.vertexIndices.length; corner++) {
      const b = geometry.positions[face.vertexIndices[corner]!]!;
      const c = geometry.positions[face.vertexIndices[corner + 1]!]!;
      sum += a.dot(b.clone().cross(c)) / 6;
    }
  });
  return sum;
}

/**
 * Returns whether every directed edge has exactly one opposite partner, which
 * means the surface is closed and consistently wound.
 *
 * @param geometry Geometry to check.
 * @returns True when closed and consistently wound.
 */
function isClosedAndConsistent(geometry: TopologyWorkingGeometry): boolean {
  const counts = new Map<string, number>();
  for (const face of geometry.faces) {
    face.vertexIndices.forEach((vertex, corner) => {
      const key = `${vertex}>${face.vertexIndices[(corner + 1) % face.vertexIndices.length]}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
  }
  return [...counts.entries()].every(([key, count]) => {
    const [from, to] = key.split('>');
    return count === 1 && counts.get(`${to}>${from}`) === 1;
  });
}

describe('extrudeTopologyWorkingFaces', () => {
  it('pushes a face out along its normal and walls it in', () => {
    const size = 1 + Math.random();
    const distance = 0.2 + Math.random();
    const geometry = box(size);
    const normal = topologyFaceAreaVector(geometry, 1).normalize();
    const centreBefore = faceCentre(geometry, 1);
    expect(extrudeTopologyWorkingFaces(geometry, [1], distance).applied).toBe(true);
    expect(geometry.faces).toHaveLength(10);
    expect(faceCentre(geometry, 1).sub(centreBefore).dot(normal)).toBeCloseTo(distance, 6);
    expect(isClosedAndConsistent(geometry)).toBe(true);
    expect(volume(geometry)).toBeCloseTo(size ** 3 + size * size * distance, 6);
  });

  it('pushes a face into the mesh with a negative distance and keeps the surface closed', () => {
    const size = 1 + Math.random();
    const depth = size * (0.2 + Math.random() * 0.5);
    const geometry = box(size);
    expect(extrudeTopologyWorkingFaces(geometry, [1], -depth).applied).toBe(true);
    expect(isClosedAndConsistent(geometry)).toBe(true);
    expect(volume(geometry)).toBeCloseTo(size ** 3 - size * size * depth, 6);
    const wallNormal = topologyFaceAreaVector(geometry, 6).normalize();
    const towardPocket = faceCentre(geometry, 1).sub(faceCentre(geometry, 6));
    expect(wallNormal.dot(towardPocket)).toBeGreaterThan(0);
  });

  it('moves touching faces together and only walls their shared outline', () => {
    const geometry = box(1);
    expect(extrudeTopologyWorkingFaces(geometry, [1, 4], 0.5).applied).toBe(true);
    expect(geometry.faces).toHaveLength(6 + 6);
    expect(geometry.positions).toHaveLength(8 + 6);
    expect(isClosedAndConsistent(geometry)).toBe(true);
  });

  it('moves touching faces one by one with individual grouping', () => {
    const geometry = box(1);
    expect(extrudeTopologyWorkingFaces(geometry, [1, 4], 0.5, 'individual').applied).toBe(true);
    expect(geometry.faces).toHaveLength(6 + 8);
    expect(geometry.positions).toHaveLength(8 + 8);
  });

  it('keeps the face texture and continues its UVs up the walls', () => {
    const geometry = box(2);
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
    const geometry = box(1);
    expect(extrudeTopologyWorkingFaces(geometry, [1], 0).applied).toBe(false);
    expect(extrudeTopologyWorkingFaces(geometry, [], 1).applied).toBe(false);
    expect(geometry.faces).toHaveLength(6);
  });
});

/**
 * Returns the average corner position of a face.
 *
 * @param geometry Geometry.
 * @param face Face index.
 * @returns Centre point.
 */
function faceCentre(geometry: TopologyWorkingGeometry, face: number): THREE.Vector3 {
  const loop = geometry.faces[face]!.vertexIndices;
  return loop
    .reduce((sum, vertex) => sum.add(geometry.positions[vertex]!), new THREE.Vector3())
    .divideScalar(loop.length);
}
