import type * as THREE from 'three';
import { syncMeshDocumentTexturesFromDisplayMesh } from '@/mesh/convert/mesh_document_face_texture_sync.js';
import { rebuildSurfaceMaterials } from '@/texture/material/builder_surface_material.js';
import { contentMeshImportFinalize } from './content_mesh_import.js';
import { readPersistentMeshDocument } from '@/mesh/document/mesh_document_binding.js';
import { meshTopologyFaceHalfEdgeIndices } from '@/mesh/topology/mesh_topology_query.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import {
  cloneFaceTextureMapping,
  createDefaultFaceTextureMapping,
  type FaceTextureMapEntry,
} from '@/texture/uv/face_texture_mapping.js';
import type { MeshDocument } from '@/mesh/document/mesh_document.js';
import { getFaceTextureMaps, setFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';

/** Texture slots of a mesh: a short texture list and the slot of each face. */
export interface ContentMeshTextureSlots {
  /** Library texture of each slot; null is the default texture. */
  textures: readonly (string | null)[];
  /** Slot of each document face, in face order. */
  slots: readonly number[];
}

/**
 * Finishes an imported or generated mesh like {@link contentMeshImportFinalize},
 * with slot 0 painting the whole mesh, then paints each face with its slot's
 * texture.
 *
 * @param mesh Mesh made by contentMeshImportCreate, with its final world
 *   matrix.
 * @param hasAuthoredUvs Whether the document's corner UVs were given.
 * @param slots Texture slots.
 */
export function contentMeshImportFinalizeSlots(
  mesh: THREE.Mesh,
  hasAuthoredUvs: boolean,
  slots: ContentMeshTextureSlots,
): void {
  contentMeshImportFinalize(mesh, hasAuthoredUvs, slots.textures[0] ?? undefined);
  if (slots.textures.length < 2) return;
  contentMeshTextureSlotsApply(mesh, slots);
  rebuildSurfaceMaterials(mesh);
  syncMeshDocumentTexturesFromDisplayMesh(mesh);
}

/**
 * Paints each face of a content mesh with its slot's texture, keeping the
 * mapping the mesh already has. One slot leaves the mesh as it is.
 *
 * @param mesh Content mesh with its persistent document and display geometry.
 * @param slots Texture slots.
 */
function contentMeshTextureSlotsApply(mesh: THREE.Mesh, slots: ContentMeshTextureSlots): void {
  const document = readPersistentMeshDocument(mesh);
  if (document === null) return;
  const base = getFaceTextureMaps(mesh)[0]?.mapping ?? createDefaultFaceTextureMapping();
  const entries: FaceTextureMapEntry[] = slots.textures.map((texture) => {
    const mapping = cloneFaceTextureMapping(base);
    mapping.textureId = texture ?? DEFAULT_CHECKER_TEXTURE_ID;
    return { triangleIndices: [], mapping };
  });
  contentMeshTextureSlotsTriangles(document, slots.slots).forEach((slot, triangle) =>
    (entries[slot] ?? entries[0])?.triangleIndices.push(triangle),
  );
  setFaceTextureMaps(
    mesh,
    entries.filter((entry) => entry.triangleIndices.length > 0),
  );
}

/**
 * Lists the slot of each display triangle: every face shows as its corner count
 * less two triangles, in face order.
 *
 * @param document Mesh document.
 * @param slots Slot of each face.
 * @returns Slot of each triangle.
 */
function contentMeshTextureSlotsTriangles(document: MeshDocument, slots: readonly number[]): number[] {
  const topology = document.getTopology();
  return Array.from({ length: topology.getFaceCount() }, (_, face) =>
    Array<number>(Math.max(0, meshTopologyFaceHalfEdgeIndices(topology, face).length - 2)).fill(slots[face] ?? 0),
  ).flat();
}
