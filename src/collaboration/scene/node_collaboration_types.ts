import type * as THREE from 'three';
import type { ObjectEntry } from '@/io/scene/io_types.js';
import type { SerializedSolidBrush } from '@/solid/io/solid_model_codec.js';
import type { SolidOperation } from '@/solid/types/solid_operation.js';
import type { SolidModel } from '@/solid/model/solid_model.js';

/** Kind of a synchronized scene node. */
export type NodeCollaborationKind = 'entry' | 'brush' | 'solidGroup';

/**
 * Payload of a world mesh, plain group, or solid model root. `uv` holds the
 * literal vertex UVs of a primitive mesh, which its entry only describes by
 * constructor parameters; older peers ignore it.
 */
export interface NodeCollaborationEntryData {
  entry: ObjectEntry;
  locked: boolean;
  solid: { invertedWorld: boolean } | null;
  uv?: number[];
}

/** Payload of one solid brush. */
export interface NodeCollaborationBrushData {
  brush: SerializedSolidBrush;
  locked: boolean;
}

/** Payload of a CSG group inside a solid model. */
export interface NodeCollaborationSolidGroupData {
  name: string;
  operation: SolidOperation;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  visible: boolean;
  locked: boolean;
}

/** Wire state of one synchronized node. */
export interface NodeCollaborationState {
  id: string;
  kind: NodeCollaborationKind;
  parent: string;
  key: string;
  model?: string;
  data: NodeCollaborationEntryData | NodeCollaborationBrushData | NodeCollaborationSolidGroupData;
}

/** Live scene binding of a synchronized node. */
export interface NodeCollaborationRef {
  id: string;
  kind: NodeCollaborationKind;
  object: THREE.Object3D;
  model: SolidModel | null;
  localId: string;
}

/** Baseline record of a node as last agreed with the room. */
export interface NodeCollaborationBaseline {
  state: NodeCollaborationState;
  text: string;
  fingerprint: string;
}

/** Parent id used for nodes directly under the world root. */
export const NODE_PARENT_WORLD = '';
