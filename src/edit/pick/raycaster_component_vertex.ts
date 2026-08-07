import type { MeshDocument } from '@/mesh/document/mesh_document.js';
import type * as THREE from 'three';

/** One mesh candidate for vertex picking. */
export interface ComponentVertexPickCandidate {
  targetId: string;
  mesh: THREE.Mesh;
  document: MeshDocument;
}
