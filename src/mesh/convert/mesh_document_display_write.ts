import type * as THREE from 'three';
import type { MeshDocument } from '@/mesh/document/mesh_document.js';
import { writePersistentMeshDocument } from '@/mesh/document/mesh_document_binding.js';
import { rebuildSurfaceMaterials } from '@/texture/material/builder_surface_material.js';
import { rebuildDecorativeEdges } from '@/utils/mesh_edge_sync.js';
import { invalidateFacePickAcceleration } from '@/selection/pick/mesh_pick_acceleration.js';
import { meshDocumentToBufferGeometry } from './mesh_to_buffer_geometry.js';
import { attachDisplayPositionPatch } from './mesh_display_position_patch.js';
import { writeFaceTextureMapsFromMeshDocument } from './mesh_document_face_texture_sync.js';

/**
 * Rebuilds a content mesh BufferGeometry from a MeshDocument, restores
 * multi-texture face maps and material groups, and refreshes decorative edges.
 * Triangle order stays document expansion order so Edit Mode face picks can map
 * raycast triangle indices back to MeshDocument faces.
 *
 * @param mesh Display mesh.
 * @param document Source mesh document.
 */
export function writeMeshDocumentDisplayGeometry(mesh: THREE.Mesh, document: MeshDocument): void {
  document.markPositionsDirty();
  const previous = mesh.geometry;
  const geometry = meshDocumentToBufferGeometry(document);
  attachDisplayPositionPatch(geometry, document);
  mesh.geometry = geometry;
  previous.dispose();
  writeFaceTextureMapsFromMeshDocument(mesh, document);
  rebuildSurfaceMaterials(mesh, undefined, undefined, { preserveTriangleOrder: true });
  invalidateFacePickAcceleration(mesh.geometry);
  writePersistentMeshDocument(mesh, document);
  rebuildDecorativeEdges(mesh);
}
