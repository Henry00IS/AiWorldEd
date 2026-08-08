import * as THREE from 'three';
import { MeshDocument } from '@/mesh/document/mesh_document.js';
import { readPersistentMeshDocument, writePersistentMeshDocument } from '@/mesh/document/mesh_document_binding.js';
import {
  captureMeshDocumentCornerUvsFromDisplay,
  captureMeshDocumentFaceTexturesFromDisplay,
  syncMeshDocumentTexturesFromDisplayMesh,
} from '@/mesh/convert/mesh_document_face_texture_sync.js';
import { writeMeshDocumentDisplayGeometry } from '@/mesh/convert/mesh_document_display_write.js';
import { meshDocumentFromBufferGeometryWelded } from './mesh_edit_weld.js';

/** UserData key storing a session MeshDocument on a content mesh. */
export const MESH_EDIT_DOCUMENT_USERDATA_KEY = 'meshEditDocument';

/**
 * Returns a MeshDocument bound to a content mesh for Edit Mode. Prefers an
 * existing session document, then a persistent authored/import document (n-gon
 * safe). Only meshes with no document fall back to a one-time weld of the
 * current BufferGeometry into triangle faces. Display geometry is rebuilt from
 * the document so GPU data is never topology source during editing.
 *
 * @param mesh Content mesh.
 * @returns Bound mesh document, or null when geometry is unusable.
 */
export function ensureMeshEditDocument(mesh: THREE.Mesh): MeshDocument | null {
  const sessionDocument = readBoundMeshEditDocument(mesh);
  if (sessionDocument) {
    return sessionDocument;
  }
  const persistent = readPersistentMeshDocument(mesh);
  if (persistent) {
    return bindSessionDocumentAndSyncDisplay(mesh, persistent.clone());
  }
  return bindWeldedDocumentFromGeometry(mesh);
}

/**
 * Reads a previously bound session MeshDocument from mesh userData.
 *
 * @param mesh Content mesh.
 * @returns Document or null.
 */
export function readBoundMeshEditDocument(mesh: THREE.Mesh): MeshDocument | null {
  const value = mesh.userData[MESH_EDIT_DOCUMENT_USERDATA_KEY];
  if (value instanceof MeshDocument) {
    return value;
  }
  return null;
}

/**
 * Clears a session MeshDocument binding from a mesh. Writes the session result
 * back as the persistent document so authored topology survives leaving Edit
 * Mode and later re-entry without re-welding display triangles.
 *
 * @param mesh Content mesh.
 */
export function clearMeshEditDocumentBinding(mesh: THREE.Mesh): void {
  const sessionDocument = readBoundMeshEditDocument(mesh);
  if (sessionDocument) {
    writePersistentMeshDocument(mesh, sessionDocument.clone());
  }
  delete mesh.userData[MESH_EDIT_DOCUMENT_USERDATA_KEY];
}

/**
 * Copies current display face textures onto any bound session or persistent
 * MeshDocument so texture assigns outside rebuild paths stay authoritative.
 *
 * @param mesh Content mesh.
 */
export function syncBoundMeshDocumentTexturesFromDisplay(mesh: THREE.Mesh): void {
  syncMeshDocumentTexturesFromDisplayMesh(mesh);
}

/**
 * Welds a MeshDocument from mesh geometry once and stores it as the session
 * binding. Used only when no authored document exists.
 *
 * @param mesh Content mesh.
 * @returns Document, or null when empty.
 */
function bindWeldedDocumentFromGeometry(mesh: THREE.Mesh): MeshDocument | null {
  const geometry = mesh.geometry;
  if (!(geometry instanceof THREE.BufferGeometry)) {
    return null;
  }
  const document = meshDocumentFromBufferGeometryWelded(geometry, undefined, mesh);
  if (document.getTopology().getVertexCount() === 0) {
    return null;
  }
  return bindSessionDocumentAndSyncDisplay(mesh, document);
}

/**
 * Stores a session document, captures live display textures and corner UVs,
 * then rebuilds BufferGeometry from the document via ear-clip expansion.
 *
 * @param mesh Content mesh.
 * @param document Session document to bind.
 * @returns The bound document.
 */
function bindSessionDocumentAndSyncDisplay(mesh: THREE.Mesh, document: MeshDocument): MeshDocument {
  captureMeshDocumentFaceTexturesFromDisplay(mesh, document);
  captureMeshDocumentCornerUvsFromDisplay(mesh, document);
  mesh.userData[MESH_EDIT_DOCUMENT_USERDATA_KEY] = document;
  writeMeshDocumentDisplayGeometry(mesh, document);
  return document;
}
