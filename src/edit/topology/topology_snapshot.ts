import type * as THREE from 'three';
import type { MeshDocument } from '@/mesh/document/mesh_document.js';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { SolidModel } from '@/solid/model/solid_model.js';
import type { FaceSurfaceDescriptionSerialized } from '@/texture/uv_matrix/face_surface_description.js';

/** Snapshot of one content mesh document. */
export interface TopologyMeshSnapshot {
  kind: 'mesh';
  targetId: string;
  mesh: THREE.Mesh;
  document: MeshDocument;
}

/** Snapshot of one solid brush including UV surfaces. */
export interface TopologyBrushSnapshot {
  kind: 'brush';
  targetId: string;
  solidModel: SolidModel;
  brushId: string;
  brush: SolidBrush;
  mesh: THREE.Mesh | null;
  defaultSurface: FaceSurfaceDescriptionSerialized | null;
  faceSurfaces: (FaceSurfaceDescriptionSerialized | undefined)[] | null;
}

/** Snapshot of one topology edit target. */
export type TopologySnapshot = TopologyMeshSnapshot | TopologyBrushSnapshot;
