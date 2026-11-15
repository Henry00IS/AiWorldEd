import type * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { SolidOperation } from '@/solid/types/solid_operation.js';

/** A convex brush to insert, centered on its local origin. */
export interface SolidTreeBrush {
  kind: 'brush';
  /** Display name source; a unique name is allocated on insert. */
  name: string;
  operation: SolidOperation;
  /** Centered convex topology. */
  brush: SolidBrush;
  /** Brush origin in the local space of its parent. */
  center: THREE.Vector3;
}

/** A CSG group to insert with its members in evaluation order. */
export interface SolidTreeGroup {
  kind: 'group';
  name: string;
  operation: SolidOperation;
  children: SolidTreeNode[];
}

/** Node of a solid subtree inserted in one undo step. */
export type SolidTreeNode = SolidTreeBrush | SolidTreeGroup;
