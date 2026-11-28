import { describe, expect, it } from 'vitest';
import { curveConstrain } from '@/curve/model/curve_constrain.js';
import { CURVE_POINTS_MAX, curveFromPolyline, type Curve } from '@/curve/model/curve_model.js';
import { curveSample } from '@/curve/model/curve_sample.js';
import { curveSegmentInsert, curveSegmentRemove, curveSegmentRemovedPoint } from '@/curve/model/curve_segments.js';

/**
 * Lists the x and height of every point.
 *
 * @param curve Curve.
 * @returns Pairs.
 */
function places(curve: Curve): number[][] {
  return curve.points.map((point) => [point.x, point.y]);
}

const TENT = curveFromPolyline([
  [0, 0],
  [0.5, 1],
  [1, 0],
]);

describe('curveSegmentRemovedPoint', () => {
  it('is the point the segment ends at, or its start for the last segment', () => {
    expect(curveSegmentRemovedPoint(0, 4)).toBe(1);
    expect(curveSegmentRemovedPoint(1, 4)).toBe(2);
    expect(curveSegmentRemovedPoint(2, 4)).toBe(2);
    expect(curveSegmentRemovedPoint(0, 3)).toBe(1);
    expect(curveSegmentRemovedPoint(1, 3)).toBe(1);
  });
});

describe('curveSegmentRemove', () => {
  it('never takes the first or last point', () => {
    for (let index = 0; index < 2; index += 1) {
      const made = curveSegmentRemove(TENT, index);
      expect(made.points).toHaveLength(2);
      expect(made.points[0]?.x).toBe(0);
      expect(made.points[1]?.x).toBe(1);
      expect(made.segments).toHaveLength(1);
    }
  });

  it('keeps the segment that runs on with its own mode and handles', () => {
    const bent = curveConstrain({
      points: [
        { x: 0, y: 0, in: { x: 0, y: 0 }, out: { x: 0.1, y: 0 } },
        { x: 0.4, y: 1, in: { x: -0.1, y: 0 }, out: { x: 0.1, y: 0 } },
        { x: 1, y: 0, in: { x: -0.1, y: 0 }, out: { x: 0, y: 0 } },
      ],
      segments: [
        { mode: 'linear', detail: 8 },
        { mode: 'bezier', detail: 5 },
      ],
    });
    const made = curveSegmentRemove(bent, 0);
    expect(made.segments).toEqual([{ mode: 'bezier', detail: 5 }]);
    expect(made.points[1]?.in.x).toBeCloseTo(-0.1, 9);
  });

  it('does not change the curve it is given', () => {
    const before = JSON.stringify(TENT);
    curveSegmentRemove(TENT, 0);
    expect(JSON.stringify(TENT)).toBe(before);
  });

  it('keeps markers', () => {
    const marked = { ...TENT, markers: { bottom: 0.2, top: 0.8 } };
    expect(curveSegmentRemove(marked, 0).markers).toEqual({ bottom: 0.2, top: 0.8 });
  });
});

describe('curveSegmentInsert', () => {
  it('numbers the new point as asked and keeps one segment less than points', () => {
    for (let at = 0; at <= 3; at += 1) {
      const made = curveSegmentInsert(
        curveFromPolyline([
          [0, 0],
          [0.3, 1],
          [0.6, 0],
          [1, 1],
        ]),
        at,
        0.45,
        0.5,
        'linear',
      );
      expect(made.points).toHaveLength(5);
      expect(made.segments).toHaveLength(4);
    }
  });

  it('keeps every x in order whatever x is asked', () => {
    const four = curveFromPolyline([
      [0, 0],
      [0.3, 1],
      [0.6, 0],
      [1, 1],
    ]);
    for (const x of [-5, 0, 0.1, 0.45, 0.9, 5, Number.NaN])
      for (let at = 0; at <= 4; at += 1) {
        const xs = curveSegmentInsert(four, at, x, 0.5, 'bezier').points.map((point) => point.x);
        expect(xs).toEqual([...xs].sort((a, b) => a - b));
        expect(xs[0]).toBe(0);
        expect(xs.at(-1)).toBe(1);
      }
  });

  it('moves the old end in at 0 and at the end, with the new point at the edge', () => {
    expect(places(curveSegmentInsert(TENT, 0, 0.2, 0.7, 'linear'))).toEqual([
      [0, 0.7],
      [0.2, 0],
      [0.5, 1],
      [1, 0],
    ]);
    expect(places(curveSegmentInsert(TENT, 3, 0.8, 0.7, 'linear'))).toEqual([
      [0, 0],
      [0.5, 1],
      [0.8, 0],
      [1, 0.7],
    ]);
  });

  it('gives a bent new segment handles along its chord, so it starts straight', () => {
    const made = curveSegmentInsert(TENT, 1, 0.25, 0.5, 'bezier');
    expect(made.segments[1]?.mode).toBe('bezier');
    expect(made.points[1]?.out.x).toBeCloseTo((0.5 - 0.25) / 3, 9);
    expect(made.points[2]?.in.x).toBeCloseTo(-(0.5 - 0.25) / 3, 9);
  });

  it('does not change the curve it is given', () => {
    const before = JSON.stringify(TENT);
    curveSegmentInsert(TENT, 1, 0.25, 0.5, 'bezier');
    expect(JSON.stringify(TENT)).toBe(before);
  });

  it('works on a curve of the most points less one, not past it', () => {
    const points = Array.from(
      { length: CURVE_POINTS_MAX - 1 },
      (_, index) => [index / (CURVE_POINTS_MAX - 2), 0] as [number, number],
    );
    const made = curveSegmentInsert(curveFromPolyline(points), 5, 0.5, 0.5, 'linear');
    expect(made.points).toHaveLength(CURVE_POINTS_MAX);
  });
});

describe('curveConstrain with handles far outside their segment', () => {
  it('brings both handles of a bezier segment in before they meet', () => {
    const wide = curveConstrain({
      points: [
        { x: 0, y: 0, in: { x: 0, y: 0 }, out: { x: 3, y: 5 } },
        { x: 1, y: 1, in: { x: -3, y: -2 }, out: { x: 0, y: 0 } },
      ],
      segments: [{ mode: 'bezier', detail: 8 }],
    });
    expect(wide.points[0]?.out).toEqual({ x: 0.5, y: 1 });
    expect(wide.points[1]?.in).toEqual({ x: -0.5, y: -1 });
  });
});

describe('curveSample safety net', () => {
  it('keeps sampled x from running back when points are out of order', () => {
    const crossed: Curve = {
      points: [
        { x: 0, y: 0, in: { x: 0, y: 0 }, out: { x: 0, y: 0 } },
        { x: 0.8, y: 1, in: { x: 0, y: 0 }, out: { x: 0, y: 0 } },
        { x: 0.3, y: 0, in: { x: 0, y: 0 }, out: { x: 0, y: 0 } },
        { x: 1, y: 1, in: { x: 0, y: 0 }, out: { x: 0, y: 0 } },
      ],
      segments: Array.from({ length: 3 }, () => ({ mode: 'linear' as const, detail: 8 })),
    };
    const xs = curveSample(crossed).map((point) => point.x);
    expect(xs).toEqual([0, 0.8, 0.8, 1]);
  });

  it('does not change a valid curve', () => {
    expect(curveSample(TENT).map((point) => point.x)).toEqual([0, 0.5, 1]);
  });
});
