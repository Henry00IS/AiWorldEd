import type * as THREE from 'three';
import { MeshDocument } from './mesh_document.js';

/**
 * Persistent MeshDocument on a content mesh (import / authoring). Survives Edit
 * Mode enter/exit so n-gon topology is not rebuilt from triangulated GPU data.
 */
export const MESH_DOCUMENT_USERDATA_KEY = 'meshDocument';

/**
 * Reads a persistent MeshDocument from mesh userData.
 *
 * @param mesh Content mesh.
 * @returns Document or null.
 */
export function readPersistentMeshDocument(mesh: THREE.Object3D): MeshDocument | null {
  const value = mesh.userData[MESH_DOCUMENT_USERDATA_KEY];
  if (value instanceof MeshDocument) {
    return value;
  }
  return null;
}

/**
 * Stores a persistent MeshDocument on a mesh.
 *
 * @param mesh Content mesh.
 * @param document Document to bind.
 */
export function writePersistentMeshDocument(mesh: THREE.Object3D, document: MeshDocument): void {
  mesh.userData[MESH_DOCUMENT_USERDATA_KEY] = document;
}
