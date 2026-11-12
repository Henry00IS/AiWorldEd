import { describe, expect, it } from 'vitest';
import { curveGroupBounds, curveMovePoints, curveScalePoints } from '@/curve/model/curve_group.js';
import { curveFromPolyline } from '@/curve/model/curve_model.js';
import { curveSegmentModeSet } from '@/curve/model/curve_edit.js';

const FIVE = curveFromPolyline([
  [0, 0.2],
  [0.2, 0.4],
  [0.4, 0.5],
  [0.6, 0.6],
  [1, 0.3],
]);
const xs = (curve: typeof FIVE) => curve.points.map((point) => Number(point.x.toFixed(6)));
const ys = (curve: typeof FIVE) => curve.points.map((point) => Number(point.y.toFixed(6)));

describe('curve group move and scale', () => {
  it('moves selected points together, keeping their shape', () => {
    const moved = curveMovePoints(FIVE, [1, 2], 0.05, 0.1);
    expect(xs(moved)).toEqual([0, 0.25, 0.45, 0.6, 1]);
    expect(ys(moved)).toEqual([0.2, 0.5, 0.6, 0.6, 0.3]);
  });

  it('stops the whole group at the first neighbour outside it, never passing it', () => {
    expect(xs(curveMovePoints(FIVE, [1, 2], 0.5, 0))).toEqual([0, 0.4, 0.6, 0.6, 1]);
    expect(xs(curveMovePoints(FIVE, [1, 2], -0.5, 0))).toEqual([0, 0, 0.2, 0.6, 1]);
    expect(ys(curveMovePoints(FIVE, [2, 3], 0, 0.9))).toEqual([0.2, 0.4, 0.9, 1, 0.3]);
  });

  it('moves end points only vertically while inner points follow the group', () => {
    const moved = curveMovePoints(FIVE, [0, 1], 0.1, -0.1);
    expect(xs(moved)).toEqual([0, 0.3, 0.4, 0.6, 1]);
    expect(ys(moved)).toEqual([0.1, 0.3, 0.5, 0.6, 0.3]);
    const all = curveMovePoints(FIVE, [0, 1, 2, 3, 4], 0.3, 0);
    expect(xs(all)).toEqual([0, 0.5, 0.7, 0.9, 1]);
  });

  it('scales about an anchor and clamps the factor so points keep their order', () => {
    const wider = curveScalePoints(FIVE, [1, 2], { x: 0.2, y: 0.4 }, { x: 1.5, y: 2 });
    expect(xs(wider)).toEqual([0, 0.2, 0.5, 0.6, 1]);
    expect(ys(wider)).toEqual([0.2, 0.4, 0.6, 0.6, 0.3]);
    const clamped = curveScalePoints(FIVE, [1, 2], { x: 0.2, y: 0.4 }, { x: 5, y: 1 });
    expect(xs(clamped)).toEqual([0, 0.2, 0.6, 0.6, 1]);
    const flipped = curveScalePoints(FIVE, [1, 2], { x: 0.2, y: 0.4 }, { x: -1, y: -1 });
    expect(xs(flipped)).toEqual([0, 0.2, 0.2, 0.6, 1]);
    expect(ys(flipped)).toEqual([0.2, 0.4, 0.4, 0.6, 0.3]);
  });

  it('keeps end points at x 0 and 1 when scaling, and stays inside 0..1 vertically', () => {
    const scaled = curveScalePoints(FIVE, [0, 1, 2, 3, 4], { x: 0, y: 0.2 }, { x: 0.5, y: 10 });
    expect(xs(scaled)).toEqual([0, 0.1, 0.2, 0.3, 1]);
    expect(Math.max(...ys(scaled))).toBeCloseTo(1, 9);
    expect(ys(scaled)[0]).toBeCloseTo(0.2, 9);
  });

  it('scales handles with their points and keeps them inside their segments', () => {
    const bent = curveSegmentModeSet(FIVE, 1, 'bezier');
    const scaled = curveScalePoints(bent, [1, 2], { x: 0.2, y: 0.4 }, { x: 0.5, y: 1 });
    const out = scaled.points[1]!.out;
    expect(scaled.points[1]!.x + out.x).toBeLessThanOrEqual(scaled.points[2]!.x + 1e-9);
    expect(curveGroupBounds(scaled, [1, 2])).toEqual({
      min: { x: 0.2, y: 0.4 },
      max: { x: expect.closeTo(0.3, 9), y: 0.5 },
    });
  });
});
