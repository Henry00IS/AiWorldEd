import type * as THREE from 'three';
import type { MeshDocument } from '@/mesh/document/mesh_document.js';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { SolidModel } from '@/solid/model/solid_model.js';

/** Live content mesh that can receive topology edits. */
export interface TopologyMeshTarget {
  kind: 'mesh';
  targetId: string;
  mesh: THREE.Mesh;
  document: MeshDocument;
}

/** Live solid brush that can receive topology edits. */
export interface TopologyBrushTarget {
  kind: 'brush';
  targetId: string;
  solidModel: SolidModel;
  brushId: string;
  brush: SolidBrush;
  mesh: THREE.Mesh | null;
}

/** Live topology edit target. */
export type TopologyEditTarget = TopologyMeshTarget | TopologyBrushTarget;
