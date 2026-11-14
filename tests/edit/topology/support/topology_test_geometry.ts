import * as THREE from 'three';
import type { TopologyWorkingGeometry } from '@/edit/topology/topology_working_geometry.js';

/**
 * Builds a closed box of quads with outward winding.
 *
 * @param size Edge length.
 * @returns Working geometry.
 */
export function topologyTestBox(size: number): TopologyWorkingGeometry {
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
export function topologyTestVolume(geometry: TopologyWorkingGeometry): number {
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
export function topologyTestIsClosedAndConsistent(geometry: TopologyWorkingGeometry): boolean {
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

/**
 * Returns the average corner position of a face.
 *
 * @param geometry Geometry.
 * @param face Face index.
 * @returns Centre point.
 */
export function topologyTestFaceCentre(geometry: TopologyWorkingGeometry, face: number): THREE.Vector3 {
  const loop = geometry.faces[face]!.vertexIndices;
  return loop
    .reduce((sum, vertex) => sum.add(geometry.positions[vertex]!), new THREE.Vector3())
    .divideScalar(loop.length);
}
