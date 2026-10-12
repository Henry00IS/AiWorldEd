import type { Vector3 } from 'three';
import { topologyWorkingFaceIsPolygon, type TopologyWorkingFace } from './topology_working_face.js';
import type { TopologyWorkingGeometry } from './topology_working_geometry.js';

/**
 * Drops degenerate faces and unused vertices, remapping remaining indices.
 *
 * @param geometry Geometry mutated in place.
 */
export function compactTopologyWorkingGeometry(geometry: TopologyWorkingGeometry): void {
  geometry.faces = geometry.faces.filter((face) => topologyWorkingFaceIsPolygon(face));
  const used = collectUsedVertexIndices(geometry.faces);
  const remap = buildVertexIndexRemap(used, geometry.positions.length);
  remapWorkingFaceVertices(geometry.faces, remap);
  geometry.positions = extractUsedPositions(geometry.positions, used);
}

/**
 * Collects vertex indices referenced by remaining faces.
 *
 * @param faces Remaining faces.
 * @returns Sorted unique used indices.
 */
function collectUsedVertexIndices(faces: readonly TopologyWorkingFace[]): number[] {
  const used = new Set<number>();
  for (const face of faces) {
    for (const vertexIndex of face.vertexIndices) {
      used.add(vertexIndex);
    }
  }
  return [...used].sort((left, right) => left - right);
}

/**
 * Builds old-index to compact-index remap, or -1 for unused vertices.
 *
 * @param used Sorted used indices.
 * @param vertexCount Previous vertex count.
 * @returns Remap table.
 */
function buildVertexIndexRemap(used: readonly number[], vertexCount: number): number[] {
  const remap = new Array<number>(vertexCount).fill(-1);
  for (let compactIndex = 0; compactIndex < used.length; compactIndex++) {
    const oldIndex = used[compactIndex];
    if (oldIndex === undefined) {
      continue;
    }
    remap[oldIndex] = compactIndex;
  }
  return remap;
}

/**
 * Rewrites face vertex indices through a remap table.
 *
 * @param faces Faces to rewrite.
 * @param remap Old to new vertex indices.
 */
function remapWorkingFaceVertices(faces: TopologyWorkingFace[], remap: readonly number[]): void {
  for (const face of faces) {
    for (let corner = 0; corner < face.vertexIndices.length; corner++) {
      const oldIndex = face.vertexIndices[corner];
      if (oldIndex === undefined) {
        continue;
      }
      face.vertexIndices[corner] = remap[oldIndex] ?? -1;
    }
  }
}

/**
 * Collects positions for the compacted vertex table.
 *
 * @param positions Previous positions.
 * @param used Sorted used indices.
 * @returns Compacted positions.
 */
function extractUsedPositions(positions: readonly Vector3[], used: readonly number[]): Vector3[] {
  const compacted: Vector3[] = [];
  for (const oldIndex of used) {
    const position = positions[oldIndex];
    if (position) {
      compacted.push(position);
    }
  }
  return compacted;
}
