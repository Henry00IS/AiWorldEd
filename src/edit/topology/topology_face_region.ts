import * as THREE from 'three';
import type { TopologyWorkingGeometry } from './topology_working_geometry.js';

/** Group of selected faces joined through shared vertices. */
export interface TopologyFaceRegion {
  /** Face indices in the region, in ascending order. */
  faceIndices: number[];
  /** Unit area-weighted normal of the region, or a zero vector when flat out. */
  normal: THREE.Vector3;
}

/**
 * Groups faces into regions that share at least one vertex.
 *
 * @param geometry Working geometry.
 * @param faceIndices Faces to group; missing faces are ignored.
 * @returns Regions with their averaged normals.
 */
export function collectTopologyFaceRegions(
  geometry: TopologyWorkingGeometry,
  faceIndices: readonly number[],
): TopologyFaceRegion[] {
  const faces = [...new Set(faceIndices)].filter((index) => geometry.faces[index] !== undefined).sort((a, b) => a - b);
  const groups = new Map<number, number[]>();
  const owner = faceRegionOwners(geometry, faces);
  for (const face of faces) {
    const root = owner(face);
    groups.set(root, [...(groups.get(root) ?? []), face]);
  }
  return [...groups.values()].map((group) => ({
    faceIndices: group,
    normal: topologyFaceGroupNormal(geometry, group),
  }));
}

/**
 * Builds a union-find over faces joined by shared vertices.
 *
 * @param geometry Working geometry.
 * @param faces Faces to join.
 * @returns Function that returns the region root of a face.
 */
function faceRegionOwners(geometry: TopologyWorkingGeometry, faces: readonly number[]): (face: number) => number {
  const parent = new Map<number, number>(faces.map((face) => [face, face]));
  const find = (face: number): number => {
    const next = parent.get(face) ?? face;
    if (next === face) return face;
    const root = find(next);
    parent.set(face, root);
    return root;
  };
  const firstFaceOfVertex = new Map<number, number>();
  for (const face of faces) {
    for (const vertex of geometry.faces[face]!.vertexIndices) {
      const other = firstFaceOfVertex.get(vertex);
      if (other === undefined) firstFaceOfVertex.set(vertex, face);
      else parent.set(find(face), find(other));
    }
  }
  return find;
}

/**
 * Returns the area-weighted unit normal of a group of faces.
 *
 * @param geometry Working geometry.
 * @param faces Face indices.
 * @returns Unit normal, or a zero vector when the areas cancel out.
 */
export function topologyFaceGroupNormal(geometry: TopologyWorkingGeometry, faces: readonly number[]): THREE.Vector3 {
  const sum = new THREE.Vector3();
  for (const face of faces) sum.add(topologyFaceAreaVector(geometry, face));
  return sum.lengthSq() > 1e-24 ? sum.normalize() : sum;
}

/**
 * Returns twice-area normal of one face, pointing to the side its winding
 * faces.
 *
 * @param geometry Working geometry.
 * @param face Face index.
 * @returns Area vector.
 */
export function topologyFaceAreaVector(geometry: TopologyWorkingGeometry, face: number): THREE.Vector3 {
  const loop = geometry.faces[face]!.vertexIndices.map((index) => geometry.positions[index]!);
  const sum = new THREE.Vector3();
  loop.forEach((point, corner) => sum.add(point.clone().cross(loop[(corner + 1) % loop.length]!)));
  return sum;
}
