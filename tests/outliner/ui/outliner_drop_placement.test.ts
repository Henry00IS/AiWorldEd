import { describe, expect, it } from 'vitest';
import {
  elevateOutlinerDropTarget,
  outlinerIndentDepthClaimMinX,
  outlinerRowDepthOffsetPx,
  pickOutlinerDropVisualTarget,
  remapAfterOnExpandedContainer,
  resolveOutlinerDropPlacement,
  resolveOutlinerDropTarget,
  resolveOutlinerIndentDepth,
  resolveOutlinerInsertLineGeometry,
  outlinerDragEdgeScrollDeltaResolve,
  outlinerRowIndexFromClientYResolve,
  OUTLINER_BASE_PADDING_PX,
  OUTLINER_DRAG_SCROLL_EDGE_PX,
  OUTLINER_DRAG_SCROLL_HOLD_RAMP_MS,
  OUTLINER_LEADING_CHROME_PX,
  OUTLINER_ROW_HEIGHT_PX,
  OUTLINER_TREE_PADDING_PX,
  outlinerDragEdgeScrollHoldFactorResolve,
  outlinerInsertLineLeftPx,
  outlinerInsertLineNameDepthForTargetDepth,
} from '@/outliner/ui/outliner_drop_placement.js';

describe('resolveOutlinerDropPlacement', () => {
  it('should place leaf rows as before in the top half', () => {
    expect(resolveOutlinerDropPlacement(9, 0, 20, false)).toBe('before');
  });

  it('should place leaf rows as after in the bottom half', () => {
    expect(resolveOutlinerDropPlacement(10, 0, 20, false)).toBe('after');
  });

  it('should place container rows as into in the middle band', () => {
    expect(resolveOutlinerDropPlacement(10, 0, 20, true)).toBe('into');
  });

  it('should place container rows as before in the top quarter', () => {
    expect(resolveOutlinerDropPlacement(2, 0, 20, true)).toBe('before');
  });

  it('should place container rows as after in the bottom quarter', () => {
    expect(resolveOutlinerDropPlacement(18, 0, 20, true)).toBe('after');
  });

  it('should default to before for invalid geometry', () => {
    expect(resolveOutlinerDropPlacement(Number.NaN, 0, 20, false)).toBe('before');
    expect(resolveOutlinerDropPlacement(10, 0, 0, false)).toBe('before');
  });
});

describe('resolveOutlinerIndentDepth', () => {
  it('should keep nested depth over the row chevron and icon', () => {
    const treeLeft = 100;
    const claimDepth1 = outlinerIndentDepthClaimMinX(1);
    // Just left of the depth-1 indent → root. On the indent (chevron/icon) → depth 1.
    const overGutterX = treeLeft + claimDepth1 - 2;
    const overChromeX = treeLeft + claimDepth1 + 2;
    const overNameX = treeLeft + claimDepth1 + OUTLINER_LEADING_CHROME_PX + 2;
    expect(resolveOutlinerIndentDepth(overGutterX, treeLeft, 1)).toBe(0);
    expect(resolveOutlinerIndentDepth(overChromeX, treeLeft, 1)).toBe(1);
    expect(resolveOutlinerIndentDepth(overNameX, treeLeft, 1)).toBe(1);
  });

  it('should only elevate when the pointer is left of the nested row indent', () => {
    const treeLeft = 0;
    // Mid-row over a depth-1 item (chevron/icon) keeps depth 1.
    const midChromeX = outlinerRowDepthOffsetPx(1) + OUTLINER_LEADING_CHROME_PX / 2;
    expect(midChromeX).toBeGreaterThan(OUTLINER_TREE_PADDING_PX + OUTLINER_BASE_PADDING_PX);
    expect(resolveOutlinerIndentDepth(midChromeX, treeLeft, 1)).toBe(1);
    // True gutter left of the depth-1 indent elevates to root.
    expect(resolveOutlinerIndentDepth(outlinerIndentDepthClaimMinX(1) - 1, treeLeft, 1)).toBe(0);
  });

  it('should clamp depth to the hovered row max', () => {
    const treeLeft = 0;
    const deepX = outlinerIndentDepthClaimMinX(8);
    expect(resolveOutlinerIndentDepth(deepX, treeLeft, 1)).toBe(1);
  });

  it('should stack claim thresholds per nested depth', () => {
    const treeLeft = 0;
    expect(resolveOutlinerIndentDepth(outlinerIndentDepthClaimMinX(2) - 1, treeLeft, 2)).toBe(1);
    expect(resolveOutlinerIndentDepth(outlinerIndentDepthClaimMinX(2), treeLeft, 2)).toBe(2);
  });
});

describe('outlinerInsertLineNameDepthForTargetDepth', () => {
  it('should map nested target depth to the parent name depth', () => {
    expect(outlinerInsertLineNameDepthForTargetDepth(2)).toBe(1);
    expect(outlinerInsertLineNameDepthForTargetDepth(1)).toBe(0);
  });

  it('should use full-width root lines for root-level targets', () => {
    expect(outlinerInsertLineNameDepthForTargetDepth(0)).toBe(-1);
  });
});

describe('resolveOutlinerInsertLineGeometry', () => {
  it('should span the full outliner width for root depth with no left margin', () => {
    const geometry = resolveOutlinerInsertLineGeometry(200, 0);
    expect(geometry.left).toBe(0);
    expect(geometry.width).toBe(200);
  });

  it('should honor measured name left even at depth zero parent names', () => {
    const geometry = resolveOutlinerInsertLineGeometry(200, 0, 48);
    expect(geometry.left).toBe(48);
    expect(geometry.width).toBe(152);
  });

  it('should start at the measured name column for nested inserts', () => {
    const geometry = resolveOutlinerInsertLineGeometry(200, 1, 42);
    expect(geometry.left).toBe(42);
    expect(geometry.width).toBe(158);
  });

  it('should fall back to estimated name column when measurement is missing', () => {
    const root = resolveOutlinerInsertLineGeometry(200, 0);
    const child = resolveOutlinerInsertLineGeometry(200, 1);
    const grand = resolveOutlinerInsertLineGeometry(200, 2);
    expect(child.left).toBe(outlinerInsertLineLeftPx(1));
    expect(grand.left).toBe(outlinerInsertLineLeftPx(2));
    expect(child.width).toBeLessThan(root.width);
    expect(grand.width).toBeLessThan(child.width);
  });

  it('should estimate parent name left for a nested after-child insert', () => {
    // After Brush1 (depth 1 under Group depth 0) → line at Group name (depth 0).
    const nameDepth = outlinerInsertLineNameDepthForTargetDepth(1);
    expect(nameDepth).toBe(0);
    const geometry = resolveOutlinerInsertLineGeometry(200, 1, outlinerInsertLineLeftPx(nameDepth));
    expect(geometry.left).toBe(outlinerInsertLineLeftPx(0));
    expect(geometry.left).toBe(outlinerRowDepthOffsetPx(0) + OUTLINER_LEADING_CHROME_PX);
    expect(geometry.left).toBeLessThan(outlinerInsertLineLeftPx(1));
  });

  it('should keep left plus width within host width for half-pixel name edges', () => {
    const hostWidth = 200;
    const geometry = resolveOutlinerInsertLineGeometry(hostWidth, 1, 42.5);
    expect(geometry.left).toBe(43);
    expect(geometry.width).toBe(157);
    expect(geometry.left + geometry.width).toBe(hostWidth);
  });

  it('should floor fractional host width so geometry stays inside the client box', () => {
    const geometry = resolveOutlinerInsertLineGeometry(200.9, 0);
    expect(geometry.left).toBe(0);
    expect(geometry.width).toBe(200);
  });
});

describe('outlinerDragEdgeScrollDeltaResolve', () => {
  const fullHold = OUTLINER_DRAG_SCROLL_HOLD_RAMP_MS;

  it('should return zero outside the edge bands', () => {
    expect(outlinerDragEdgeScrollDeltaResolve(100, 0, 400, fullHold)).toBe(0);
  });

  it('should scroll up faster at the outer top edge than near the band center', () => {
    const outer = outlinerDragEdgeScrollDeltaResolve(0, 0, 400, fullHold);
    const mid = outlinerDragEdgeScrollDeltaResolve(OUTLINER_DRAG_SCROLL_EDGE_PX * 0.5, 0, 400, fullHold);
    const nearOuter = outlinerDragEdgeScrollDeltaResolve(OUTLINER_DRAG_SCROLL_EDGE_PX * 0.15, 0, 400, fullHold);
    expect(outer).toBeLessThan(0);
    expect(Math.abs(outer)).toBeGreaterThan(Math.abs(nearOuter));
    expect(Math.abs(nearOuter)).toBeGreaterThanOrEqual(Math.abs(mid));
    expect(Math.abs(outer)).toBeGreaterThanOrEqual(OUTLINER_ROW_HEIGHT_PX * 6);
  });

  it('should barely move in the outer half of the band until near the rim', () => {
    const outer = Math.abs(outlinerDragEdgeScrollDeltaResolve(0, 0, 400, fullHold));
    const half = Math.abs(outlinerDragEdgeScrollDeltaResolve(OUTLINER_DRAG_SCROLL_EDGE_PX * 0.5, 0, 400, fullHold));
    const threeQuarter = Math.abs(
      outlinerDragEdgeScrollDeltaResolve(OUTLINER_DRAG_SCROLL_EDGE_PX * 0.25, 0, 400, fullHold),
    );
    expect(half).toBeLessThanOrEqual(OUTLINER_ROW_HEIGHT_PX);
    expect(threeQuarter).toBeLessThan(outer * 0.2);
  });

  it('should creep slowly just inside the edge band', () => {
    const almostInner = outlinerDragEdgeScrollDeltaResolve(OUTLINER_DRAG_SCROLL_EDGE_PX - 2, 0, 400, fullHold);
    expect(Math.abs(almostInner)).toBeLessThanOrEqual(1);
  });

  it('should keep mid-band drag scroll far below full outer speed', () => {
    const outer = Math.abs(outlinerDragEdgeScrollDeltaResolve(0, 0, 400, fullHold));
    const mid = Math.abs(outlinerDragEdgeScrollDeltaResolve(OUTLINER_DRAG_SCROLL_EDGE_PX * 0.5, 0, 400, fullHold));
    expect(mid).toBeLessThan(outer * 0.08);
  });

  it('should stay still at the outer edge until hold ramp builds', () => {
    expect(outlinerDragEdgeScrollDeltaResolve(0, 0, 400, 0)).toBe(0);
    const early = Math.abs(outlinerDragEdgeScrollDeltaResolve(0, 0, 400, 200));
    const full = Math.abs(outlinerDragEdgeScrollDeltaResolve(0, 0, 400, fullHold));
    expect(early).toBeLessThan(full * 0.05);
    expect(full).toBeGreaterThan(0);
  });

  it('should ease hold factor from zero to one over the ramp window', () => {
    expect(outlinerDragEdgeScrollHoldFactorResolve(0)).toBe(0);
    expect(outlinerDragEdgeScrollHoldFactorResolve(fullHold / 2)).toBeCloseTo(0.25, 5);
    expect(outlinerDragEdgeScrollHoldFactorResolve(fullHold)).toBe(1);
  });

  it('should scroll down at the bottom edge', () => {
    const delta = outlinerDragEdgeScrollDeltaResolve(400, 0, 400, fullHold);
    expect(delta).toBeGreaterThan(0);
  });
});

describe('outlinerRowIndexFromClientYResolve', () => {
  it('should return null for an empty list', () => {
    expect(outlinerRowIndexFromClientYResolve(100, 0, 0, 0)).toBeNull();
  });

  it('should map the first row without scroll', () => {
    const clientY = OUTLINER_TREE_PADDING_PX + 1;
    expect(outlinerRowIndexFromClientYResolve(clientY, 0, 0, 1000)).toBe(0);
  });

  it('should map a deep row using fixed height and scrollTop', () => {
    const rowIndex = 500;
    const clientY = OUTLINER_TREE_PADDING_PX + rowIndex * OUTLINER_ROW_HEIGHT_PX + 4;
    expect(outlinerRowIndexFromClientYResolve(clientY, 0, 0, 1000)).toBe(rowIndex);
  });

  it('should clamp below the first row and past the last row', () => {
    expect(outlinerRowIndexFromClientYResolve(-50, 0, 0, 10)).toBe(0);
    const pastEnd = OUTLINER_TREE_PADDING_PX + 50 * OUTLINER_ROW_HEIGHT_PX;
    expect(outlinerRowIndexFromClientYResolve(pastEnd, 0, 0, 10)).toBe(9);
  });

  it('should account for tree host top offset and scrollTop', () => {
    const treeTop = 80;
    const scrollTop = 220;
    const rowIndex = 12;
    const clientY = treeTop + OUTLINER_TREE_PADDING_PX + rowIndex * OUTLINER_ROW_HEIGHT_PX - scrollTop + 2;
    expect(outlinerRowIndexFromClientYResolve(clientY, treeTop, scrollTop, 100)).toBe(rowIndex);
  });
});

describe('remapAfterOnExpandedContainer', () => {
  it('should turn after-on-expanded-parent into before first child', () => {
    const remapped = remapAfterOnExpandedContainer(
      'group',
      0,
      'after',
      (node) => node === 'group',
      (node) => (node === 'group' ? 'childA' : null),
    );
    expect(remapped).toEqual({ target: 'childA', depth: 1, placement: 'before' });
  });

  it('should keep after on collapsed parent as sibling after', () => {
    const remapped = remapAfterOnExpandedContainer(
      'group',
      0,
      'after',
      () => false,
      () => 'childA',
    );
    expect(remapped).toEqual({ target: 'group', depth: 0, placement: 'after' });
  });

  it('should keep before placement unchanged on expanded parent', () => {
    const remapped = remapAfterOnExpandedContainer(
      'group',
      0,
      'before',
      () => true,
      () => 'childA',
    );
    expect(remapped).toEqual({ target: 'group', depth: 0, placement: 'before' });
  });
});

describe('elevateOutlinerDropTarget', () => {
  /**
   * Builds a tiny linear parent map for elevation tests.
   *
   * @returns Parent lookup and first/last predicates for A→B→C.
   */
  function createChainFixture() {
    const parents = new Map<string, string | null>([
      ['solid', null],
      ['brushA', 'solid'],
      ['brushB', 'solid'],
    ]);
    const order = new Map<string, string[]>([['solid', ['brushA', 'brushB']]]);
    return {
      getParent: (node: string) => parents.get(node) ?? null,
      isFirst: (node: string) => {
        const parent = parents.get(node);
        if (!parent) return true;
        return order.get(parent)?.[0] === node;
      },
      isLast: (node: string) => {
        const parent = parents.get(node);
        if (!parent) return true;
        const siblings = order.get(parent) ?? [];
        return siblings[siblings.length - 1] === node;
      },
    };
  }

  it('should elevate after the last open child to the parent when indent is shallow', () => {
    const { getParent, isLast } = createChainFixture();
    const elevated = elevateOutlinerDropTarget('brushB', 1, 'after', 0, getParent, isLast);
    expect(elevated).toEqual({ target: 'solid', depth: 0 });
  });

  it('should not elevate after a middle child even when indent is shallow', () => {
    const { getParent, isLast } = createChainFixture();
    const elevated = elevateOutlinerDropTarget('brushA', 1, 'after', 0, getParent, isLast);
    expect(elevated).toEqual({ target: 'brushA', depth: 1 });
  });

  it('should not elevate before the first open child when indent is shallow', () => {
    const { getParent, isLast } = createChainFixture();
    const elevated = elevateOutlinerDropTarget('brushA', 1, 'before', 0, getParent, isLast);
    expect(elevated).toEqual({ target: 'brushA', depth: 1 });
  });

  it('should keep into placement on the hovered container without elevating', () => {
    const { getParent, isLast } = createChainFixture();
    const elevated = elevateOutlinerDropTarget('solid', 0, 'into', 0, getParent, isLast);
    expect(elevated).toEqual({ target: 'solid', depth: 0 });
  });

  it('should keep nested after placement when indent matches the child depth', () => {
    const { getParent, isLast } = createChainFixture();
    const elevated = elevateOutlinerDropTarget('brushB', 1, 'after', 1, getParent, isLast);
    expect(elevated).toEqual({ target: 'brushB', depth: 1 });
  });

  it('should stop elevation below an ancestor the drop may not follow', () => {
    const parents = new Map<string, string | null>([
      ['world', null],
      ['solid', 'world'],
      ['group', 'solid'],
      ['inner', 'group'],
    ]);
    const lastChildren = new Set(['group', 'inner']);
    const getParent = (node: string) => parents.get(node) ?? null;
    const isLast = (node: string) => lastChildren.has(node);
    const canDropAfter = (node: string) => node !== 'solid';
    const elevated = elevateOutlinerDropTarget('inner', 2, 'after', 0, getParent, isLast, canDropAfter);
    expect(elevated).toEqual({ target: 'group', depth: 1 });
  });
});

describe('resolveOutlinerDropTarget', () => {
  it('should keep after last nested child when X is over that row chevron or icon', () => {
    const parents = new Map<string, string | null>([
      ['solid', null],
      ['brush', 'solid'],
    ]);
    // Over depth-1 chevron/icon of the last child — stays nested under solid.
    const nestedChromeX = outlinerIndentDepthClaimMinX(1) + 4;
    const resolved = resolveOutlinerDropTarget(
      'brush',
      1,
      nestedChromeX,
      15,
      0,
      20,
      0,
      false,
      (node) => parents.get(node) ?? null,
      () => true,
    );
    expect(resolved.target).toBe('brush');
    expect(resolved.placement).toBe('after');
    expect(resolved.visualTarget).toBe('brush');
    expect(resolved.insertDepth).toBe(1);
  });

  it('should elevate after last open child only when X is left of that row indent', () => {
    const parents = new Map<string, string | null>([
      ['solid', null],
      ['brush', 'solid'],
    ]);
    // True gutter left of the nested row indent elevates to parent after.
    const shallowGutterX = outlinerIndentDepthClaimMinX(1) - 4;
    const resolved = resolveOutlinerDropTarget(
      'brush',
      1,
      shallowGutterX,
      15,
      0,
      20,
      0,
      false,
      (node) => parents.get(node) ?? null,
      () => true,
    );
    expect(resolved.target).toBe('solid');
    expect(resolved.placement).toBe('after');
    expect(resolved.visualTarget).toBe('brush');
    expect(resolved.insertDepth).toBe(0);
  });

  it('should not promote before-first-child with shallow X to a root full-width drop', () => {
    const parents = new Map<string, string | null>([
      ['group', null],
      ['childA', 'group'],
      ['childB', 'group'],
    ]);
    const shallowX = outlinerIndentDepthClaimMinX(1) - 4;
    // Top half of first child (before) + shallow X must stay nested under group.
    const resolved = resolveOutlinerDropTarget(
      'childA',
      1,
      shallowX,
      5,
      0,
      20,
      0,
      false,
      (node) => parents.get(node) ?? null,
      (node) => node === 'childB',
    );
    expect(resolved.target).toBe('childA');
    expect(resolved.placement).toBe('before');
    expect(resolved.insertDepth).toBe(1);
  });

  it('should remap bottom of expanded parent to before first child not full-width after', () => {
    const parents = new Map<string, string | null>([
      ['group', null],
      ['childA', 'group'],
    ]);
    // Bottom quarter of expanded group row (after band) at root depth.
    const resolved = resolveOutlinerDropTarget(
      'group',
      0,
      8,
      18,
      0,
      20,
      0,
      true,
      (node) => parents.get(node) ?? null,
      () => false,
      (node) => node === 'group',
      (node) => (node === 'group' ? 'childA' : null),
    );
    expect(resolved.target).toBe('childA');
    expect(resolved.placement).toBe('before');
    expect(resolved.insertDepth).toBe(1);
  });

  it('should keep into on a container middle band so nesting remains available', () => {
    const resolved = resolveOutlinerDropTarget(
      'solid',
      0,
      outlinerIndentDepthClaimMinX(1) + 8,
      10,
      0,
      20,
      0,
      true,
      () => null,
      () => true,
    );
    expect(resolved.target).toBe('solid');
    expect(resolved.placement).toBe('into');
    expect(resolved.insertDepth).toBe(0);
    expect(pickOutlinerDropVisualTarget(resolved.target, 'solid', 'into')).toBe('solid');
  });
});
