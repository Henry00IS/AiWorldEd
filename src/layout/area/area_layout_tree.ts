import { AreaBorderResize } from './area_border_resize.js';
import type { AreaLeafPayload } from './area_editor_type.js';
import {
  areRectsJoinable,
  areaRectBottom,
  areaRectRight,
  clampAreaNumber,
  createUnitAreaRect,
  type AreaRect,
} from './area_rect.js';
import type { AreaSplitDirection } from './area_split_direction.js';
import {
  createAreaLeafNode,
  createAreaSplitNode,
  isAreaLeafNode,
  type AreaLeafNode,
  type AreaSplitNode,
  type AreaTreeNode,
} from './area_tree_node.js';
import type { AreaLeafPlacement } from './area_leaf_placement.js';
import { mergePlacementPair, rebuildAreaTreeFromPlacements } from './area_tree_rebuild.js';

export type { AreaLeafPlacement } from './area_leaf_placement.js';

/** Minimum and maximum allowed split ratios. */
export const AREA_SPLIT_RATIO_MIN = 0.05;
export const AREA_SPLIT_RATIO_MAX = 0.95;

/**
 * Clamps a split ratio into the safe range.
 *
 * @param ratio Requested ratio.
 * @returns Clamped ratio.
 */
export function clampAreaSplitRatio(ratio: number): number {
  return clampAreaNumber(ratio, AREA_SPLIT_RATIO_MIN, AREA_SPLIT_RATIO_MAX);
}

/**
 * Lists every leaf with its normalized rect filling the unit square without
 * gaps.
 *
 * @param root Layout tree root.
 * @returns Leaf placements in depth-first order.
 */
export function listAreaLeafPlacements(root: AreaTreeNode): AreaLeafPlacement[] {
  const placements: AreaLeafPlacement[] = [];
  collectLeafPlacements(root, createUnitAreaRect(), placements);
  return placements;
}

/**
 * Returns the leaf count of a tree.
 *
 * @param root Layout tree root.
 * @returns Number of leaves.
 */
export function countAreaLeaves(root: AreaTreeNode): number {
  if (isAreaLeafNode(root)) return 1;
  return countAreaLeaves(root.first) + countAreaLeaves(root.second);
}

/**
 * Finds a leaf node by area id.
 *
 * @param root Layout tree root.
 * @param areaId Target area id.
 * @returns Leaf node or null.
 */
export function findAreaLeafById(root: AreaTreeNode, areaId: string): AreaLeafNode | null {
  if (isAreaLeafNode(root)) {
    return root.payload.areaId === areaId ? root : null;
  }
  return findAreaLeafById(root.first, areaId) ?? findAreaLeafById(root.second, areaId);
}

/**
 * Returns the placement for a leaf id when present.
 *
 * @param root Layout tree root.
 * @param areaId Target area id.
 * @returns Placement or null.
 */
export function findAreaLeafPlacement(root: AreaTreeNode, areaId: string): AreaLeafPlacement | null {
  return listAreaLeafPlacements(root).find((item) => item.payload.areaId === areaId) ?? null;
}

/**
 * Splits a leaf into two leaves along a direction.
 *
 * @param root Layout tree root.
 * @param areaId Leaf to split.
 * @param direction Split axis.
 * @param ratio Fraction for the original leaf (first child).
 * @param newPayload Payload for the new sibling leaf.
 * @returns New tree root, or the original root when the leaf is missing.
 */
export function splitAreaLeaf(
  root: AreaTreeNode,
  areaId: string,
  direction: AreaSplitDirection,
  ratio: number,
  newPayload: AreaLeafPayload,
): AreaTreeNode {
  return replaceLeafWithSplit(root, areaId, direction, clampAreaSplitRatio(ratio), newPayload) ?? root;
}

/**
 * Moves a shared border, including overlapping pane sides at a T-junction, then
 * rebuilds the BSP tree. Independent pane borders retain their rects.
 *
 * @param root Layout tree root.
 * @param firstAreaId Area on the left or top of the shared border.
 * @param secondAreaId Area on the right or bottom of the shared border.
 * @param ratio Fraction of the two-pane span kept by `firstAreaId`.
 * @returns Updated root, or the original root when the pair is not adjacent.
 */
export function setSplitRatioBetweenAreas(
  root: AreaTreeNode,
  firstAreaId: string,
  secondAreaId: string,
  ratio: number,
): AreaTreeNode {
  const placements = cloneLeafPlacements(listAreaLeafPlacements(root));
  const first = placements.find((item) => item.payload.areaId === firstAreaId);
  const second = placements.find((item) => item.payload.areaId === secondAreaId);
  if (!first || !second) return root;
  const clamped = clampAreaSplitRatio(ratio);
  if (!AreaBorderResize.apply(placements, first, second, clamped, AREA_SPLIT_RATIO_MIN)) return root;
  return rebuildAreaTreeFromPlacements(placements, createUnitAreaRect());
}

/**
 * Converts a normalized pointer into the two-pane ratio for
 * {@link setSplitRatioBetweenAreas}.
 *
 * @param root Layout tree root.
 * @param firstAreaId Left or top area id of the border.
 * @param secondAreaId Right or bottom area id of the border.
 * @param borderDirection Border axis (`horizontal` = vertical divider).
 * @param normalizedX Pointer x in layer unit space [0,1].
 * @param normalizedY Pointer y in layer unit space [0,1].
 * @returns Ratio for `firstAreaId` within the two-pane span, or 0.5.
 */
export function computeSplitRatioFromNormalizedPointer(
  root: AreaTreeNode,
  firstAreaId: string,
  secondAreaId: string,
  borderDirection: AreaSplitDirection,
  normalizedX: number,
  normalizedY: number,
): number {
  const placements = listAreaLeafPlacements(root);
  const first = placements.find((item) => item.payload.areaId === firstAreaId);
  const second = placements.find((item) => item.payload.areaId === secondAreaId);
  if (!first || !second) return 0.5;
  if (borderDirection === 'horizontal') {
    return ratioAlongHorizontalPair(first.rect, second.rect, normalizedX);
  }
  return ratioAlongVerticalPair(first.rect, second.rect, normalizedY);
}

/**
 * Joins two leaves when they share a full edge. The survivor keeps its payload;
 * the removed leaf is dropped. When the leaves are not joinable, returns null.
 *
 * @param root Layout tree root.
 * @param survivorId Area id that remains.
 * @param removeId Area id that is absorbed.
 * @returns New root, or null when join is illegal.
 */
export function joinAreaLeaves(root: AreaTreeNode, survivorId: string, removeId: string): AreaTreeNode | null {
  if (survivorId === removeId) return null;
  if (countAreaLeaves(root) < 2) return null;
  const placements = listAreaLeafPlacements(root);
  const survivor = placements.find((item) => item.payload.areaId === survivorId);
  const removed = placements.find((item) => item.payload.areaId === removeId);
  if (!survivor || !removed) return null;
  if (!areRectsJoinable(survivor.rect, removed.rect)) return null;
  const siblingJoin = tryCollapseSiblingPair(root, survivorId, removeId);
  if (siblingJoin) return siblingJoin;
  const merged = mergePlacementPair(placements, survivorId, removeId);
  return rebuildAreaTreeFromPlacements(merged, createUnitAreaRect());
}

/**
 * Deep-clones a tree node graph.
 *
 * @param root Source tree.
 * @returns Independent clone.
 */
export function cloneAreaTree(root: AreaTreeNode): AreaTreeNode {
  if (isAreaLeafNode(root)) {
    return createAreaLeafNode({ ...root.payload });
  }
  return createAreaSplitNode(root.direction, root.ratio, cloneAreaTree(root.first), cloneAreaTree(root.second));
}

/**
 * Collects leaf placements under a node into an array.
 *
 * @param node Current node.
 * @param rect Parent rect for this node.
 * @param out Destination list.
 */
function collectLeafPlacements(node: AreaTreeNode, rect: AreaRect, out: AreaLeafPlacement[]): void {
  if (isAreaLeafNode(node)) {
    out.push({ payload: node.payload, rect });
    return;
  }
  const { firstRect, secondRect } = splitRect(rect, node.direction, node.ratio);
  collectLeafPlacements(node.first, firstRect, out);
  collectLeafPlacements(node.second, secondRect, out);
}

/**
 * Divides a parent rect into first/second child rects.
 *
 * @param rect Parent rect.
 * @param direction Split axis.
 * @param ratio Fraction for first child.
 * @returns First and second child rects.
 */
function splitRect(
  rect: AreaRect,
  direction: AreaSplitDirection,
  ratio: number,
): { firstRect: AreaRect; secondRect: AreaRect } {
  if (direction === 'horizontal') {
    const firstWidth = rect.width * ratio;
    return {
      firstRect: { x: rect.x, y: rect.y, width: firstWidth, height: rect.height },
      secondRect: {
        x: rect.x + firstWidth,
        y: rect.y,
        width: rect.width - firstWidth,
        height: rect.height,
      },
    };
  }
  const firstHeight = rect.height * ratio;
  return {
    firstRect: { x: rect.x, y: rect.y, width: rect.width, height: firstHeight },
    secondRect: {
      x: rect.x,
      y: rect.y + firstHeight,
      width: rect.width,
      height: rect.height - firstHeight,
    },
  };
}

/**
 * Replaces a leaf with a split of that leaf and a new sibling.
 *
 * @param node Current node.
 * @param areaId Leaf to replace.
 * @param direction Split axis.
 * @param ratio Clamped ratio for the original leaf.
 * @param newPayload New sibling payload.
 * @returns Updated subtree, or null when leaf not found.
 */
function replaceLeafWithSplit(
  node: AreaTreeNode,
  areaId: string,
  direction: AreaSplitDirection,
  ratio: number,
  newPayload: AreaLeafPayload,
): AreaTreeNode | null {
  if (isAreaLeafNode(node)) {
    if (node.payload.areaId !== areaId) return null;
    return createAreaSplitNode(direction, ratio, createAreaLeafNode(node.payload), createAreaLeafNode(newPayload));
  }
  const first = replaceLeafWithSplit(node.first, areaId, direction, ratio, newPayload);
  if (first) return createAreaSplitNode(node.direction, node.ratio, first, node.second);
  const second = replaceLeafWithSplit(node.second, areaId, direction, ratio, newPayload);
  if (second) return createAreaSplitNode(node.direction, node.ratio, node.first, second);
  return null;
}

/**
 * Deep-copies leaf placements so border edits do not mutate live tree state.
 *
 * @param placements Source placements.
 * @returns Independent placement list.
 */
function cloneLeafPlacements(placements: readonly AreaLeafPlacement[]): AreaLeafPlacement[] {
  return placements.map((item) => ({
    payload: { ...item.payload },
    rect: { ...item.rect },
  }));
}

/**
 * Computes first-pane ratio along a left|right pair from a normalized x.
 *
 * @param first Left rect.
 * @param second Right rect.
 * @param normalizedX Pointer x in [0,1] layer space.
 * @returns Ratio for the left pane within the pair span.
 */
function ratioAlongHorizontalPair(first: AreaRect, second: AreaRect, normalizedX: number): number {
  const parentLeft = Math.min(first.x, second.x);
  const parentRight = Math.max(areaRectRight(first), areaRectRight(second));
  const parentWidth = parentRight - parentLeft;
  if (parentWidth <= 0) return 0.5;
  return (normalizedX - parentLeft) / parentWidth;
}

/**
 * Computes first-pane ratio along a top|bottom pair from a normalized y.
 *
 * @param first Top rect.
 * @param second Bottom rect.
 * @param normalizedY Pointer y in [0,1] layer space.
 * @returns Ratio for the top pane within the pair span.
 */
function ratioAlongVerticalPair(first: AreaRect, second: AreaRect, normalizedY: number): number {
  const parentTop = Math.min(first.y, second.y);
  const parentBottom = Math.max(areaRectBottom(first), areaRectBottom(second));
  const parentHeight = parentBottom - parentTop;
  if (parentHeight <= 0) return 0.5;
  return (normalizedY - parentTop) / parentHeight;
}

/**
 * Collapses a parent whose two children are exactly the survivor and remove
 * pair.
 *
 * @param node Current node.
 * @param survivorId Survivor area id.
 * @param removeId Removed area id.
 * @returns Collapsed tree when a sibling pair is found, else null.
 */
function tryCollapseSiblingPair(node: AreaTreeNode, survivorId: string, removeId: string): AreaTreeNode | null {
  if (isAreaLeafNode(node)) return null;
  const siblingResult = collapseIfSiblingPair(node, survivorId, removeId);
  if (siblingResult) return siblingResult;
  const first = tryCollapseSiblingPair(node.first, survivorId, removeId);
  if (first) return createAreaSplitNode(node.direction, node.ratio, first, node.second);
  const second = tryCollapseSiblingPair(node.second, survivorId, removeId);
  if (second) return createAreaSplitNode(node.direction, node.ratio, node.first, second);
  return null;
}

/**
 * If a split's children are the survivor and remove leaves, returns the
 * survivor leaf.
 *
 * @param node Split node.
 * @param survivorId Survivor id.
 * @param removeId Remove id.
 * @returns Survivor leaf when children match the pair, else null.
 */
function collapseIfSiblingPair(node: AreaSplitNode, survivorId: string, removeId: string): AreaTreeNode | null {
  if (!isAreaLeafNode(node.first) || !isAreaLeafNode(node.second)) return null;
  const ids = [node.first.payload.areaId, node.second.payload.areaId];
  if (!ids.includes(survivorId) || !ids.includes(removeId)) return null;
  return node.first.payload.areaId === survivorId ? node.first : node.second;
}
