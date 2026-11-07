import { describe, expect, it } from 'vitest';
import { curveConstrain, curveMoveHandle, curveMovePoint } from '@/curve/model/curve_constrain.js';
import { curveFromPolyline, curveHandlePosition, curvePointCreate, type Curve } from '@/curve/model/curve_model.js';
import { curveSegmentModeSet } from '@/curve/model/curve_edit.js';

/**
 * Returns a three-point curve rising to the middle.
 *
 * @returns Curve.
 */
function peak(): Curve {
  return curveFromPolyline([
    [0, 0.2],
    [0.5, 0.8],
    [1, 0.4],
  ]);
}

describe('curve constraints', () => {
  it('repairs a curve to ordered points inside the unit square with ends at 0 and 1', () => {
    const broken = {
      points: [curvePointCreate(0.3, -1), curvePointCreate(0.9, 0.5), curvePointCreate(0.4, 3)],
      segments: [],
    };
    const curve = curveConstrain(broken);
    const xs = curve.points.map((point) => point.x);
    expect(xs[0]).toBe(0);
    expect(xs[xs.length - 1]).toBe(1);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    expect(curve.points.every((point) => point.y >= 0 && point.y <= 1)).toBe(true);
    expect(curve.segments).toHaveLength(curve.points.length - 1);
  });

  it('pads a curve with fewer than two points', () => {
    const curve = curveConstrain({ points: [], segments: [] });
    expect(curve.points.map((point) => point.x)).toEqual([0, 1]);
  });

  it('moves end points only up and down', () => {
    const source = peak();
    const moved = curveMovePoint(source, 0, 0.7, 0.9);
    expect(moved.points[0]?.x).toBe(0);
    expect(moved.points[0]?.y).toBe(0.9);
    const last = curveMovePoint(source, source.points.length - 1, 0.2, 2);
    expect(last.points[last.points.length - 1]?.x).toBe(1);
    expect(last.points[last.points.length - 1]?.y).toBe(1);
  });

  it('keeps an inner point between its neighbours but allows equal x for steps', () => {
    const source = peak();
    const left = curveMovePoint(source, 1, -5, 0.5);
    expect(left.points[1]?.x).toBe(source.points[0]?.x);
    const right = curveMovePoint(source, 1, 5, 0.5);
    expect(right.points[1]?.x).toBe(source.points[2]?.x);
  });

  it('keeps handles inside their segment and bezier handles uncrossed', () => {
    const curve = curveSegmentModeSet(peak(), 0, 'bezier');
    const out = curveMoveHandle(curve, 0, 'out', 0.9, 0.5);
    const start = out.points[0];
    const end = out.points[1];
    if (!start || !end) throw new Error('Expected points');
    const outX = curveHandlePosition(start, 'out').x;
    const inX = curveHandlePosition(end, 'in').x;
    expect(outX).toBeLessThanOrEqual(inX);
    expect(outX).toBeLessThanOrEqual(end.x);
    const high = curveMoveHandle(curve, 1, 'in', 0.3, 7);
    expect(high.points[1] && curveHandlePosition(high.points[1], 'in').y).toBe(1);
  });
});
