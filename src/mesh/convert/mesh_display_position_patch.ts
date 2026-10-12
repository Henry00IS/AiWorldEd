import * as THREE from 'three';
import type { MeshDocument } from '@/mesh/document/mesh_document.js';
import {
  meshTopologyFaceHalfEdgeIndices,
  meshTopologyHalfEdgeCornerVertex,
} from '@/mesh/topology/mesh_topology_query.js';
import { invalidateFacePickAcceleration } from '@/selection/pick/mesh_pick_acceleration.js';
import { patchMeshDocumentOutlinePositions } from './mesh_document_outline_edges.js';
import { DECORATIVE_EDGE_USERDATA_KEY } from '@/utils/mesh_edge_sync.js';

/** UserData key for the expanded-corner slots of one display geometry. */
export const MESH_DISPLAY_POSITION_PATCH_KEY = 'meshDisplayPositionPatch';

/** Maps each topology vertex to the expanded display corners that use it. */
export interface MeshDisplayPositionPatch {
  document: MeshDocument;
  faceCount: number;
  halfEdgeCount: number;
  vertexCount: number;
  slotOffsets: Int32Array;
  slotIndices: Int32Array;
}

/**
 * Stores the corner-slot map used to update display positions without
 * rebuilding.
 *
 * @param geometry Display geometry.
 * @param document Source document.
 */
export function attachDisplayPositionPatch(geometry: THREE.BufferGeometry, document: MeshDocument): void {
  geometry.userData[MESH_DISPLAY_POSITION_PATCH_KEY] = buildDisplayPositionPatch(document);
}

/**
 * Writes current document positions into an existing display geometry.
 *
 * @param mesh Content mesh.
 * @param document Source document.
 * @returns True when the existing geometry was updated.
 */
export function tryPatchMeshDocumentDisplayPositions(mesh: THREE.Mesh, document: MeshDocument): boolean {
  const geometry = mesh.geometry;
  if (!(geometry instanceof THREE.BufferGeometry)) {
    return false;
  }
  const patch = readMatchingPatch(geometry, document);
  const positions = geometry.getAttribute('position');
  if (!patch || !(positions instanceof THREE.BufferAttribute) || !(positions.array instanceof Float32Array)) {
    return false;
  }
  if (positions.count !== patch.halfEdgeCount) {
    return false;
  }
  writePatchedCornerPositions(document, patch, positions.array);
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  patchDecorativeOutline(mesh, document);
  invalidateFacePickAcceleration(geometry);
  return true;
}

/**
 * Builds a vertex-to-corner map in display expansion order.
 *
 * @param document Source document.
 * @returns Patch tables.
 */
function buildDisplayPositionPatch(document: MeshDocument): MeshDisplayPositionPatch {
  const topology = document.getTopology();
  const vertexCount = topology.getVertexCount();
  const counts = new Int32Array(vertexCount);
  countCornerUses(document, counts);
  const slotOffsets = prefixCornerCounts(counts);
  const slotIndices = new Int32Array(topology.getHalfEdgeCount());
  fillCornerSlots(document, slotOffsets, slotIndices);
  return {
    document,
    faceCount: topology.getFaceCount(),
    halfEdgeCount: topology.getHalfEdgeCount(),
    vertexCount,
    slotOffsets,
    slotIndices,
  };
}

/**
 * Counts how many expanded corners use each vertex.
 *
 * @param document Source document.
 * @param counts Output counts.
 */
function countCornerUses(document: MeshDocument, counts: Int32Array): void {
  const topology = document.getTopology();
  const faceCount = topology.getFaceCount();
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    for (const halfEdgeIndex of meshTopologyFaceHalfEdgeIndices(topology, faceIndex)) {
      const vertexIndex = meshTopologyHalfEdgeCornerVertex(topology, halfEdgeIndex);
      counts[vertexIndex] = (counts[vertexIndex] ?? 0) + 1;
    }
  }
}

/**
 * Builds exclusive prefix offsets from per-vertex counts.
 *
 * @param counts Per-vertex corner counts.
 * @returns Offsets of length counts.length + 1.
 */
function prefixCornerCounts(counts: Int32Array): Int32Array {
  const offsets = new Int32Array(counts.length + 1);
  for (let vertexIndex = 0; vertexIndex < counts.length; vertexIndex++) {
    offsets[vertexIndex + 1] = (offsets[vertexIndex] ?? 0) + (counts[vertexIndex] ?? 0);
  }
  return offsets;
}

/**
 * Fills corner slots in the same order as display expansion.
 *
 * @param document Source document.
 * @param slotOffsets Exclusive prefix offsets. Copied before writing.
 * @param slotIndices Output corner indices.
 */
function fillCornerSlots(document: MeshDocument, slotOffsets: Int32Array, slotIndices: Int32Array): void {
  const cursor = slotOffsets.slice();
  const topology = document.getTopology();
  const faceCount = topology.getFaceCount();
  let corner = 0;
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    corner = writeFaceCornerSlots(topology, faceIndex, cursor, slotIndices, corner);
  }
}

/**
 * Writes one face's corner slots.
 *
 * @param topology Mesh topology.
 * @param faceIndex Face index.
 * @param cursor Next free slot per vertex.
 * @param slotIndices Output corner indices.
 * @param corner Next expanded corner index.
 * @returns Updated corner index.
 */
function writeFaceCornerSlots(
  topology: ReturnType<MeshDocument['getTopology']>,
  faceIndex: number,
  cursor: Int32Array,
  slotIndices: Int32Array,
  corner: number,
): number {
  let nextCorner = corner;
  for (const halfEdgeIndex of meshTopologyFaceHalfEdgeIndices(topology, faceIndex)) {
    const vertexIndex = meshTopologyHalfEdgeCornerVertex(topology, halfEdgeIndex);
    const slot = cursor[vertexIndex] ?? 0;
    slotIndices[slot] = nextCorner;
    cursor[vertexIndex] = slot + 1;
    nextCorner += 1;
  }
  return nextCorner;
}

/**
 * Returns the patch when it still describes this document topology.
 *
 * @param geometry Display geometry.
 * @param document Source document.
 * @returns Patch, or null.
 */
function readMatchingPatch(geometry: THREE.BufferGeometry, document: MeshDocument): MeshDisplayPositionPatch | null {
  const patch = geometry.userData[MESH_DISPLAY_POSITION_PATCH_KEY] as MeshDisplayPositionPatch | undefined;
  if (!patch || patch.document !== document) {
    return null;
  }
  const topology = document.getTopology();
  if (patch.faceCount !== topology.getFaceCount() || patch.halfEdgeCount !== topology.getHalfEdgeCount()) {
    return null;
  }
  if (patch.vertexCount !== topology.getVertexCount()) {
    return null;
  }
  return patch;
}

/**
 * Copies topology positions into every expanded corner slot.
 *
 * @param document Source document.
 * @param patch Corner slot map.
 * @param positions Display position buffer.
 */
function writePatchedCornerPositions(
  document: MeshDocument,
  patch: MeshDisplayPositionPatch,
  positions: Float32Array,
): void {
  const source = document.getTopology().getPositions();
  for (let vertexIndex = 0; vertexIndex < patch.vertexCount; vertexIndex++) {
    writeOneVertexSlots(source, vertexIndex, patch, positions);
  }
}

/**
 * Writes one topology vertex into its expanded corners.
 *
 * @param source Packed topology positions.
 * @param vertexIndex Topology vertex.
 * @param patch Corner slot map.
 * @param positions Display position buffer.
 */
function writeOneVertexSlots(
  source: Float32Array,
  vertexIndex: number,
  patch: MeshDisplayPositionPatch,
  positions: Float32Array,
): void {
  const start = patch.slotOffsets[vertexIndex] ?? 0;
  const end = patch.slotOffsets[vertexIndex + 1] ?? start;
  const base = vertexIndex * 3;
  const x = source[base] ?? 0;
  const y = source[base + 1] ?? 0;
  const z = source[base + 2] ?? 0;
  for (let slot = start; slot < end; slot++) {
    const corner = patch.slotIndices[slot] ?? 0;
    const dest = corner * 3;
    positions[dest] = x;
    positions[dest + 1] = y;
    positions[dest + 2] = z;
  }
}

/**
 * Updates the content outline line when it still uses the document edge buffer.
 *
 * @param mesh Content mesh.
 * @param document Source document.
 */
function patchDecorativeOutline(mesh: THREE.Mesh, document: MeshDocument): void {
  for (const child of mesh.children) {
    if (child.userData[DECORATIVE_EDGE_USERDATA_KEY] !== true || !(child instanceof THREE.LineSegments)) {
      continue;
    }
    patchMeshDocumentOutlinePositions(child.geometry, document);
  }
}
