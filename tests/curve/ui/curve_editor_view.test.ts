import { describe, expect, it } from 'vitest';
import { CurveEditorView } from '@/curve/ui/curve_editor_view.js';

/**
 * Creates a framed view.
 *
 * @param rotated True for x running up.
 * @returns View.
 */
function framed(rotated: boolean): CurveEditorView {
  const view = new CurveEditorView();
  view.rotated = rotated;
  view.resize(400, 300);
  view.frameAll();
  return view;
}

describe('curve editor view', () => {
  it('maps back and forth and puts y 0 at the bottom', () => {
    const view = framed(false);
    const point = { x: 0.3, y: 0.8 };
    const back = view.toCurve(view.toScreen(point));
    expect(back.x).toBeCloseTo(point.x);
    expect(back.y).toBeCloseTo(point.y);
    expect(view.toScreen({ x: 0, y: 0 }).y).toBeGreaterThan(view.toScreen({ x: 0, y: 1 }).y);
    expect(view.toScreen({ x: 0, y: 0 }).x).toBeLessThan(view.toScreen({ x: 1, y: 0 }).x);
  });

  it('runs x upward when rotated, like an upright pillar', () => {
    const view = framed(true);
    expect(view.toScreen({ x: 0, y: 0 }).y).toBeGreaterThan(view.toScreen({ x: 1, y: 0 }).y);
    expect(view.toScreen({ x: 0, y: 0 }).x).toBeLessThan(view.toScreen({ x: 0, y: 1 }).x);
    const back = view.toCurve(view.toScreen({ x: 0.2, y: 0.7 }));
    expect(back.x).toBeCloseTo(0.2);
    expect(back.y).toBeCloseTo(0.7);
  });

  it('keeps the point under the cursor while zooming and pans by pixels', () => {
    const view = framed(false);
    const screen = { x: 120, y: 90 };
    const before = view.toCurve(screen);
    view.zoomAt(screen, 2);
    const after = view.toCurve(screen);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    const origin = view.toScreen({ x: 0, y: 0 });
    view.pan(10, -5);
    const moved = view.toScreen({ x: 0, y: 0 });
    expect(moved.x - origin.x).toBeCloseTo(10);
    expect(moved.y - origin.y).toBeCloseTo(-5);
  });
});
