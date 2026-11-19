import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DRAG_EDGE_SCROLL_TUNING,
  DragEdgeAutoScroll,
  dragEdgeScrollBandContains,
  dragEdgeScrollDeltaResolve,
  dragEdgeScrollHoldFactorResolve,
} from '@/ui/drag/drag_edge_scroll.js';
import { OUTLINER_ROW_HEIGHT_PX } from '@/outliner/ui/outliner_drop_placement.js';

/**
 * Steps the outliner took before the edge scroll was shared, for a 400 pixel
 * tall tree: pointer Y, hold time, step, and whether Y is in a band.
 */
const OUTLINER_STEPS: readonly (readonly [number, number, number, boolean])[] = [
  [0, 0, 0, true],
  [0, 250, -3, true],
  [0, 1000, -44, true],
  [0, 2000, -176, true],
  [0, 5000, -176, true],
  [5, 0, 0, true],
  [5, 250, -2, true],
  [5, 1000, -32, true],
  [5, 2000, -128, true],
  [5, 5000, -128, true],
  [20, 0, 0, true],
  [20, 250, -1, true],
  [20, 1000, -11, true],
  [20, 2000, -44, true],
  [20, 5000, -44, true],
  [48, 0, 0, true],
  [48, 250, 0, true],
  [48, 1000, -1, true],
  [48, 2000, -3, true],
  [48, 5000, -3, true],
  [80, 0, 0, true],
  [80, 250, 0, true],
  [80, 1000, 0, true],
  [80, 2000, 0, true],
  [80, 5000, 0, true],
  [95, 0, 0, true],
  [95, 250, 0, true],
  [95, 1000, 0, true],
  [95, 2000, 0, true],
  [95, 5000, 0, true],
  [96, 0, 0, false],
  [96, 250, 0, false],
  [96, 1000, 0, false],
  [96, 2000, 0, false],
  [96, 5000, 0, false],
  [200, 0, 0, false],
  [200, 250, 0, false],
  [200, 1000, 0, false],
  [200, 2000, 0, false],
  [200, 5000, 0, false],
  [304, 0, 0, false],
  [304, 250, 0, false],
  [304, 1000, 0, false],
  [304, 2000, 0, false],
  [304, 5000, 0, false],
  [305, 0, 0, true],
  [305, 250, 0, true],
  [305, 1000, 0, true],
  [305, 2000, 0, true],
  [305, 5000, 0, true],
  [352, 0, 0, true],
  [352, 250, 0, true],
  [352, 1000, 1, true],
  [352, 2000, 3, true],
  [352, 5000, 3, true],
  [395, 0, 0, true],
  [395, 250, 2, true],
  [395, 1000, 32, true],
  [395, 2000, 128, true],
  [395, 5000, 128, true],
  [400, 0, 0, true],
  [400, 250, 3, true],
  [400, 1000, 44, true],
  [400, 2000, 176, true],
  [400, 5000, 176, true],
];

describe('dragEdgeScrollDeltaResolve', () => {
  const fullHold = DRAG_EDGE_SCROLL_TUNING.holdRampMs;

  it('should return zero outside the edge bands', () => {
    expect(dragEdgeScrollDeltaResolve(100, 0, 400, fullHold)).toBe(0);
  });

  it('should scroll up faster at the outer top edge than near the band center', () => {
    const outer = dragEdgeScrollDeltaResolve(0, 0, 400, fullHold);
    const mid = dragEdgeScrollDeltaResolve(DRAG_EDGE_SCROLL_TUNING.edgePx * 0.5, 0, 400, fullHold);
    const nearOuter = dragEdgeScrollDeltaResolve(DRAG_EDGE_SCROLL_TUNING.edgePx * 0.15, 0, 400, fullHold);
    expect(outer).toBeLessThan(0);
    expect(Math.abs(outer)).toBeGreaterThan(Math.abs(nearOuter));
    expect(Math.abs(nearOuter)).toBeGreaterThanOrEqual(Math.abs(mid));
    expect(Math.abs(outer)).toBeGreaterThanOrEqual(DRAG_EDGE_SCROLL_TUNING.rowHeightPx * 6);
  });

  it('should barely move in the outer half of the band until near the rim', () => {
    const outer = Math.abs(dragEdgeScrollDeltaResolve(0, 0, 400, fullHold));
    const half = Math.abs(dragEdgeScrollDeltaResolve(DRAG_EDGE_SCROLL_TUNING.edgePx * 0.5, 0, 400, fullHold));
    const threeQuarter = Math.abs(dragEdgeScrollDeltaResolve(DRAG_EDGE_SCROLL_TUNING.edgePx * 0.25, 0, 400, fullHold));
    expect(half).toBeLessThanOrEqual(DRAG_EDGE_SCROLL_TUNING.rowHeightPx);
    expect(threeQuarter).toBeLessThan(outer * 0.2);
  });

  it('should creep slowly just inside the edge band', () => {
    const almostInner = dragEdgeScrollDeltaResolve(DRAG_EDGE_SCROLL_TUNING.edgePx - 2, 0, 400, fullHold);
    expect(Math.abs(almostInner)).toBeLessThanOrEqual(1);
  });

  it('should keep mid-band drag scroll far below full outer speed', () => {
    const outer = Math.abs(dragEdgeScrollDeltaResolve(0, 0, 400, fullHold));
    const mid = Math.abs(dragEdgeScrollDeltaResolve(DRAG_EDGE_SCROLL_TUNING.edgePx * 0.5, 0, 400, fullHold));
    expect(mid).toBeLessThan(outer * 0.08);
  });

  it('should stay still at the outer edge until hold ramp builds', () => {
    expect(dragEdgeScrollDeltaResolve(0, 0, 400, 0)).toBe(0);
    const early = Math.abs(dragEdgeScrollDeltaResolve(0, 0, 400, 200));
    const full = Math.abs(dragEdgeScrollDeltaResolve(0, 0, 400, fullHold));
    expect(early).toBeLessThan(full * 0.05);
    expect(full).toBeGreaterThan(0);
  });

  it('should ease hold factor from zero to one over the ramp window', () => {
    expect(dragEdgeScrollHoldFactorResolve(0)).toBe(0);
    expect(dragEdgeScrollHoldFactorResolve(fullHold / 2)).toBeCloseTo(0.25, 5);
    expect(dragEdgeScrollHoldFactorResolve(fullHold)).toBe(1);
  });

  it('should scroll down at the bottom edge', () => {
    const delta = dragEdgeScrollDeltaResolve(400, 0, 400, fullHold);
    expect(delta).toBeGreaterThan(0);
  });
});

describe('the shared tuning', () => {
  it('scrolls exactly as the outliner did before it was shared', () => {
    expect(DRAG_EDGE_SCROLL_TUNING.rowHeightPx).toBe(OUTLINER_ROW_HEIGHT_PX);
    for (const [clientY, hold, step, band] of OUTLINER_STEPS) {
      expect(dragEdgeScrollDeltaResolve(clientY, 0, 400, hold)).toBe(step);
      expect(dragEdgeScrollBandContains(clientY, 0, 400)).toBe(band);
    }
  });

  it('measures steps in the row height it is given', () => {
    const tall = { ...DRAG_EDGE_SCROLL_TUNING, rowHeightPx: 44 };
    expect(dragEdgeScrollDeltaResolve(400, 0, 400, 2000, tall)).toBe(352);
  });
});

/**
 * A list whose edges are at 0 and 400 and that scrolls without limit.
 *
 * @returns Edge scroll of the list, its scroll offset and a pointer the test
 *   moves.
 */
function scrollingList(): {
  scroll: DragEdgeAutoScroll;
  offset: () => number;
  pointer: { clientX: number; clientY: number };
} {
  const list = document.createElement('div');
  list.getBoundingClientRect = () => new DOMRect(0, 0, 200, 400);
  let offset = 0;
  const pointer = { clientX: 10, clientY: 200 };
  const scroll = new DragEdgeAutoScroll({
    element: () => list,
    scrollBy: (delta) => {
      offset += delta;
      return true;
    },
    pointerGet: () => pointer,
    scrollWanted: () => true,
  });
  return { scroll, offset: () => offset, pointer };
}

describe('DragEdgeAutoScroll', () => {
  afterEach(() => vi.useRealTimers());

  it('does nothing away from the edges and speeds up while held near one', () => {
    vi.useFakeTimers();
    const { scroll, offset, pointer } = scrollingList();
    expect(scroll.tick()).toBe(false);
    pointer.clientY = 398;
    scroll.tick();
    expect(offset()).toBe(0);
    vi.advanceTimersByTime(2500);
    expect(scroll.tick()).toBe(true);
    expect(offset()).toBeGreaterThan(OUTLINER_ROW_HEIGHT_PX * 4);
    pointer.clientY = 200;
    expect(scroll.tick()).toBe(false);
    pointer.clientY = 398;
    const before = offset();
    scroll.tick();
    expect(offset() - before).toBeLessThan(OUTLINER_ROW_HEIGHT_PX);
  });

  it('keeps scrolling each animation frame while the pointer stays still, and stops on stop()', () => {
    vi.useFakeTimers();
    const { scroll, offset, pointer } = scrollingList();
    pointer.clientY = 2;
    scroll.tick();
    scroll.loopStart();
    vi.advanceTimersByTime(2500);
    const moving = offset();
    expect(moving).toBeLessThan(0);
    scroll.stop();
    vi.advanceTimersByTime(500);
    expect(offset()).toBe(moving);
  });
});
