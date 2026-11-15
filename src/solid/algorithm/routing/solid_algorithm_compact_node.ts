import { SolidOperation } from '@/solid/types/solid_operation.js';

/**
 * One node in a -style compact hierarchy array (brush leaf or branch). Children
 * of a branch occupy a contiguous slice [childOffset, childOffset +
 * childCount).
 */
export interface SolidAlgorithmCompactNode {
  /** Brush leaf or branch group. */
  kind: 'brush' | 'branch';
  /**
   * Unique compact node id used by CreateRoutingTableJob. Stable for the life
   * of one hierarchy build.
   */
  nodeId: number;
  /**
   * Prepared brush index for leaves. Virtual infinite inverted-world brush uses
   * SOLID_ALGORITHM_INFINITE_PREPARED_INDEX.
   */
  preparedIndex: number;
  /** CSG operation of this node relative to its parent. */
  operation: SolidOperation;
  /** First child index in the compact array (branches only). */
  childOffset: number;
  /** Number of children (branches only). */
  childCount: number;
  /**
   * Compact array index of the parent branch, or -1 for the root. Enables O(1)
   * ancestor walks.
   */
  parentIndex: number;
}

/** Prepared index reserved for the infinite inverted-world brush. */
export const SOLID_ALGORITHM_INFINITE_PREPARED_INDEX = -1;
