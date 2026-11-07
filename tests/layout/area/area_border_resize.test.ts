import { describe, expect, it } from 'vitest';
import { listSharedBorders } from '@/layout/area/area_adjacency.js';
import { createViewportLeafPayload } from '@/layout/area/area_editor_type.js';
import { createSinglePerspectiveLayout, DEFAULT_AREA_IDS } from '@/layout/area/area_layout_presets.js';
import {
  computeSplitRatioFromNormalizedPointer,
  joinAreaLeaves,
  listAreaLeafPlacements,
  setSplitRatioBetweenAreas,
  splitAreaLeaf,
} from '@/layout/area/area_layout_tree.js';
import { serializeAreaLayout, deserializeAreaLayout } from '@/layout/area/area_layout_serializer.js';
import { ViewportKind } from '@/viewports/core/viewport_kind.js';
import type { AreaSplitDirection } from '@/layout/area/area_split_direction.js';
import type { AreaTreeNode } from '@/layout/area/area_tree_node.js';

const firstId = DEFAULT_AREA_IDS.perspective;
const secondId = 'pane_second';
const thirdId = 'pane_third';

/**
 * Creates a T-junction with two panes before a spanning third pane.
 *
 * @param direction Direction separating the spanning pane.
 * @returns Three-pane layout.
 */
function createJunction(direction: AreaSplitDirection): AreaTreeNode {
  const initial = createSinglePerspectiveLayout();
  const opposite = direction === 'vertical' ? 'horizontal' : 'vertical';
  const halves = splitAreaLeaf(initial, firstId, direction, 0.4, createViewportLeafPayload(thirdId, ViewportKind.TOP));
  return splitAreaLeaf(halves, firstId, opposite, 0.3, createViewportLeafPayload(secondId, ViewportKind.TOP));
}

/**
 * Gets one pane rectangle and fails if it was lost.
 *
 * @param root Layout tree.
 * @param areaId Pane identifier.
 * @returns Normalized rectangle.
 */
function getRect(root: AreaTreeNode, areaId: string) {
  const placement = listAreaLeafPlacements(root).find((item) => item.payload.areaId === areaId);
  if (!placement) throw new Error(`Missing pane ${areaId}`);
  return placement.rect;
}

/**
 * Asserts that all leaves are positive, disjoint and cover the workspace.
 *
 * @param root Layout tree.
 * @param count Expected pane count.
 */
function expectTiling(root: AreaTreeNode, count: number): void {
  const placements = listAreaLeafPlacements(root);
  expect(placements).toHaveLength(count);
  expect(placements.reduce((sum, item) => sum + item.rect.width * item.rect.height, 0)).toBeCloseTo(1);
  for (const { rect } of placements) {
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);
    for (const other of placements) {
      if (other.rect === rect) continue;
      const overlapWidth =
        Math.min(rect.x + rect.width, other.rect.x + other.rect.width) - Math.max(rect.x, other.rect.x);
      const overlapHeight =
        Math.min(rect.y + rect.height, other.rect.y + other.rect.height) - Math.max(rect.y, other.rect.y);
      expect(Math.min(overlapWidth, overlapHeight)).toBeLessThanOrEqual(1e-9);
    }
  }
}

/**
 * Checks the moved coordinate and invariant perpendicular extent.
 *
 * @param before Previous layout.
 * @param after Resized layout.
 * @param direction Movement axis.
 * @param coordinate Expected divider coordinate.
 */
function expectJunction(
  before: AreaTreeNode,
  after: AreaTreeNode,
  direction: AreaSplitDirection,
  coordinate: number,
): void {
  const extent = direction === 'vertical' ? 'height' : 'width';
  const origin = direction === 'vertical' ? 'y' : 'x';
  expect(getRect(after, firstId)[extent]).toBeCloseTo(coordinate);
  expect(getRect(after, secondId)[extent]).toBeCloseTo(coordinate);
  expect(getRect(after, thirdId)[origin]).toBeCloseTo(coordinate);
  const perpendicular = direction === 'vertical' ? 'width' : 'height';
  expect(getRect(after, firstId)[perpendicular]).toBeCloseTo(getRect(before, firstId)[perpendicular]);
  expectTiling(after, 3);
}

describe.each<AreaSplitDirection>(['vertical', 'horizontal'])('partial shared border (%s)', (direction) => {
  it('exposes both overlapping border segments as resize targets', () => {
    const borders = listSharedBorders(listAreaLeafPlacements(createJunction(direction)));
    expect(borders.filter((border) => border.direction === direction)).toHaveLength(2);
  });

  it.each([firstId, secondId])('moves the entire T-junction when dragged from %s', (areaId) => {
    const root = createJunction(direction);
    const before = listAreaLeafPlacements(root);
    const resized = setSplitRatioBetweenAreas(root, areaId, thirdId, 0.65);
    expectJunction(root, resized, direction, 0.65);
    expect(listAreaLeafPlacements(root)).toEqual(before);
  });

  it('does not jump when the pointer starts on the current divider', () => {
    const root = createJunction(direction);
    const coordinate = getRect(root, firstId)[direction === 'vertical' ? 'height' : 'width'];
    const ratio = computeSplitRatioFromNormalizedPointer(root, firstId, thirdId, direction, coordinate, coordinate);
    expect(listAreaLeafPlacements(setSplitRatioBetweenAreas(root, firstId, thirdId, ratio))).toEqual(
      listAreaLeafPlacements(root),
    );
  });

  it.each([-1, 2])('clamps the connected panes for requested ratio %s', (ratio) => {
    const root = createJunction(direction);
    const resized = setSplitRatioBetweenAreas(root, firstId, thirdId, ratio);
    expectJunction(root, resized, direction, ratio < 0 ? 0.05 : 0.95);
  });

  it('preserves split/join and serialization after moving the chain', () => {
    const root = createJunction(direction);
    const resized = setSplitRatioBetweenAreas(root, firstId, thirdId, 0.65);
    const restored = deserializeAreaLayout(serializeAreaLayout(resized));
    expect(restored).not.toBeNull();
    if (!restored) return;
    expectJunction(root, restored, direction, 0.65);
    const joined = joinAreaLeaves(restored, firstId, secondId);
    expect(joined).not.toBeNull();
    if (joined) expectTiling(joined, 2);
    expect(joinAreaLeaves(restored, firstId, thirdId)).toBeNull();
  });
});

/**
 * Creates deterministic split layouts with unequal neighboring extents.
 *
 * @param seed Sequence seed.
 * @returns Generated layout.
 */
function generateLayout(seed: number): AreaTreeNode {
  let state = seed;
  const random = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296;
  let root = createSinglePerspectiveLayout();
  for (let index = 0; index < 8; index += 1) {
    const placements = listAreaLeafPlacements(root);
    const placement = placements[Math.floor(random() * placements.length)];
    if (!placement) throw new Error('Missing generated pane');
    const direction = random() < 0.5 ? 'horizontal' : 'vertical';
    root = splitAreaLeaf(
      root,
      placement.payload.areaId,
      direction,
      0.25 + random() * 0.5,
      createViewportLeafPayload(`generated_${index}`, ViewportKind.TOP),
    );
  }
  return root;
}

describe('generated overlapping edge chains', () => {
  it.each(Array.from({ length: 30 }, (_, index) => index + 1))(
    'preserves all panes and tiling for split sequence %s',
    (seed) => {
      const root = generateLayout(seed);
      const original = listAreaLeafPlacements(root);
      const borders = listSharedBorders(original);
      for (const border of borders) {
        for (const ratio of [0.1, 0.5, 0.9]) {
          const resized = setSplitRatioBetweenAreas(root, border.firstAreaId, border.secondAreaId, ratio);
          expectTiling(resized, original.length);
        }
      }
      expect(listAreaLeafPlacements(root)).toEqual(original);
    },
  );
});
