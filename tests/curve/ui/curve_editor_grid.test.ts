import { describe, expect, it } from 'vitest';
import { CurveEditorView } from '@/curve/ui/curve_editor_view.js';
import {
  curveEditorGridAlpha,
  curveEditorGridLabelStep,
  curveEditorGridLevelOf,
  curveEditorGridLevels,
  curveEditorGridRender,
  curveEditorGridSteps,
} from '@/curve/ui/curve_editor_grid.js';
import { CURVE_EDITOR_SNAP_DEFAULT } from '@/curve/ui/curve_editor_session.js';

/** One stroked line recorded by the fake canvas. */
interface RecordedLine {
  from: { x: number; y: number };
  to: { x: number; y: number };
  alpha: number;
}

/**
 * Creates a canvas context stand-in that records stroked lines.
 *
 * @returns Context and the lines it recorded.
 */
function recordingContext(): { context: CanvasRenderingContext2D; lines: RecordedLine[] } {
  const lines: RecordedLine[] = [];
  let from = { x: 0, y: 0 };
  let to = { x: 0, y: 0 };
  const context = {
    globalAlpha: 1,
    beginPath: () => undefined,
    moveTo: (x: number, y: number) => (from = { x, y }),
    lineTo: (x: number, y: number) => (to = { x, y }),
    stroke: () => lines.push({ from, to, alpha: context.globalAlpha }),
    fillText: () => undefined,
  };
  return { context: context as unknown as CanvasRenderingContext2D, lines };
}

/**
 * Creates a framed, wide view zoomed by a factor.
 *
 * @param zoom Zoom factor around the canvas centre.
 * @returns View.
 */
function wideView(zoom: number): CurveEditorView {
  const view = new CurveEditorView();
  view.resize(900, 260);
  view.frameAll();
  view.zoomAt({ x: 450, y: 130 }, zoom);
  return view;
}

/**
 * Returns the sorted screen positions of vertical or horizontal lines.
 *
 * @param lines Recorded lines.
 * @param vertical True for lines of constant screen x.
 * @returns Positions in pixels.
 */
function linePositions(lines: readonly RecordedLine[], vertical: boolean): number[] {
  return lines
    .filter((line) => (vertical ? line.from.x === line.to.x : line.from.y === line.to.y))
    .map((line) => (vertical ? line.from.x : line.from.y))
    .sort((left, right) => left - right);
}

describe('curve editor grid', () => {
  it('snaps to a 0.01 grid by default, the grid the presets are built on', () => {
    expect(CURVE_EDITOR_SNAP_DEFAULT).toBe(0.01);
  });

  it('starts the levels at the snap step and adds every coarser decade', () => {
    expect(curveEditorGridSteps(0.01)).toEqual([0.01, 0.1, 1]);
    expect(curveEditorGridSteps(0.05)).toEqual([0.05, 0.1, 1]);
    expect(curveEditorGridSteps(0.25)).toEqual([0.25, 1]);
    expect(curveEditorGridSteps(0)).toEqual([0.01, 0.1, 1]);
  });

  it('hides a level whose lines would crowd and fades it in as they spread', () => {
    expect(curveEditorGridAlpha(2)).toBe(0);
    expect(curveEditorGridAlpha(100)).toBe(1);
    const fading = [4, 6, 8, 10, 12, 16].map(curveEditorGridAlpha);
    expect(fading.every((alpha, index) => index === 0 || alpha >= (fading[index - 1] ?? 0))).toBe(true);
  });

  it('gives both axes the same spacings so cells match the unit square', () => {
    const view = wideView(1);
    const density = view.pixelsPerUnit();
    expect(density.x).toBeGreaterThan(density.y * 2);
    const levels = curveEditorGridLevels(view, 0.01);
    const finest = levels.find((level) => level.alpha > 0);
    expect(finest?.step).toBeGreaterThan(0.01);
    const { context, lines } = recordingContext();
    curveEditorGridRender(context, view, 0.01);
    expect(linePositions(lines, true)).toHaveLength(linePositions(lines, false).length);
  });

  it('draws crisp pixel-aligned lines never closer than a few pixels', () => {
    for (const zoom of [0.25, 0.5, 1, 3, 12, 40]) {
      const { context, lines } = recordingContext();
      curveEditorGridRender(context, wideView(zoom), 0.01);
      expect(
        lines.every((line) => [line.from.x, line.from.y, line.to.x, line.to.y].every((v) => v - Math.floor(v) === 0.5)),
      ).toBe(true);
      for (const vertical of [true, false]) {
        const positions = linePositions(lines, vertical);
        const gaps = positions.slice(1).map((position, index) => position - (positions[index] ?? position));
        expect(Math.min(...gaps)).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it('puts each value on the coarsest level it lies on', () => {
    const levels = curveEditorGridSteps(0.01).map((step) => ({ step, alpha: 1 }));
    expect(curveEditorGridLevelOf(0.03, levels)).toBe(0);
    expect(curveEditorGridLevelOf(0.3, levels)).toBe(1);
    expect(curveEditorGridLevelOf(1, levels)).toBe(2);
    expect(curveEditorGridLevelOf(0.005, levels)).toBe(-1);
  });

  it('spaces value labels so they never overlap', () => {
    expect(curveEditorGridLabelStep(100)).toBe(1);
    expect(curveEditorGridLabelStep(600)).toBe(0.1);
    expect(curveEditorGridLabelStep(6000)).toBe(0.01);
  });
});
