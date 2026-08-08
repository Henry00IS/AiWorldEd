import type * as THREE from 'three';
import { MeshDocument } from './mesh_document.js';

/**
 * Persistent MeshDocument on a content mesh (import / authoring). Survives Edit
 * Mode enter/exit so n-gon topology is not rebuilt from triangulated GPU data.
 */
export const MESH_DOCUMENT_USERDATA_KEY = 'meshDocument';

/** Cache key on geometry userData for document outline edges (shared string). */
export const MESH_DOCUMENT_OUTLINE_EDGE_CACHE_KEY = 'meshDocumentOutlineEdgeCache';

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
 * Stores a persistent MeshDocument on a mesh and invalidates any cached
 * document outline edges so the next outline build uses the new topology.
 *
 * @param mesh Content mesh.
 * @param document Document to bind.
 */
export function writePersistentMeshDocument(mesh: THREE.Object3D, document: MeshDocument): void {
  mesh.userData[MESH_DOCUMENT_USERDATA_KEY] = document;
  invalidateMeshDocumentOutlineEdgeCache(mesh);
}

/**
 * Clears cached MeshDocument outline edge geometry on a mesh.
 *
 * @param mesh Content mesh.
 */
export function invalidateMeshDocumentOutlineEdgeCache(mesh: THREE.Object3D): void {
  const geometry = (mesh as THREE.Mesh).geometry;
  if (!geometry || !geometry.userData) {
    return;
  }
  const existing = geometry.userData[MESH_DOCUMENT_OUTLINE_EDGE_CACHE_KEY] as
    { edges?: { dispose?: () => void } } | undefined;
  if (existing?.edges && typeof existing.edges.dispose === 'function') {
    existing.edges.dispose();
  }
  delete geometry.userData[MESH_DOCUMENT_OUTLINE_EDGE_CACHE_KEY];
}
