import type { AreaLeafPayload } from './area_editor_type.js';
import type { AreaSplitDirection } from './area_split_direction.js';

/** Leaf node: one rectangular editor area. */
export interface AreaLeafNode {
  type: 'leaf';
  payload: AreaLeafPayload;
}

/** Split node: two children divided along one axis. */
export interface AreaSplitNode {
  type: 'split';
  direction: AreaSplitDirection;
  /**
   * Fraction of the parent given to the first child along the split axis.
   * Horizontal: first is left. Vertical: first is top.
   */
  ratio: number;
  first: AreaTreeNode;
  second: AreaTreeNode;
}

/** Any node in the area layout tree. */
export type AreaTreeNode = AreaLeafNode | AreaSplitNode;

/**
 * Creates a leaf node from a payload.
 *
 * @param payload Leaf content payload.
 * @returns Leaf tree node.
 */
export function createAreaLeafNode(payload: AreaLeafPayload): AreaLeafNode {
  return { type: 'leaf', payload };
}

/**
 * Creates a split node with two children.
 *
 * @param direction Split axis.
 * @param ratio Fraction for the first child (clamped by caller).
 * @param first First child (left or top).
 * @param second Second child (right or bottom).
 * @returns Split tree node.
 */
export function createAreaSplitNode(
  direction: AreaSplitDirection,
  ratio: number,
  first: AreaTreeNode,
  second: AreaTreeNode,
): AreaSplitNode {
  return { type: 'split', direction, ratio, first, second };
}

/**
 * Returns whether a node is a leaf.
 *
 * @param node Tree node.
 * @returns True for leaf nodes.
 */
export function isAreaLeafNode(node: AreaTreeNode): node is AreaLeafNode {
  return node.type === 'leaf';
}
