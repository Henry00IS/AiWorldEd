import { describe, expect, it } from 'vitest';
import { curveFromPolyline, type Curve } from '@/curve/model/curve_model.js';
import {
  curveDeletePoint,
  curveFlip,
  curveInsertPoint,
  curveMirror,
  curveSegmentFlatten,
  curveSegmentModeSet,
  curveSegmentStraighten,
} from '@/curve/model/curve_edit.js';
import { curveMoveHandle } from '@/curve/model/curve_constrain.js';
import { curveEvaluate } from '@/curve/model/curve_sample.js';

/**
 * Returns a bent two-point curve.
 *
 * @returns Curve.
 */
function bent(): Curve {
  const straight = curveFromPolyline([
    [0, 0.1],
    [1, 0.9],
  ]);
  return curveMoveHandle(curveSegmentModeSet(straight, 0, 'bezier'), 0, 'out', 0.2, 0.8);
}

describe('curve editing', () => {
  it('inserts a point on the curve without changing its shape', () => {
    const source = bent();
    const { curve, index } = curveInsertPoint(source, 0.4);
    expect(index).toBe(1);
    expect(curve.points).toHaveLength(3);
    for (const x of [0.1, 0.3, 0.6, 0.9]) expect(curveEvaluate(curve, x)).toBeCloseTo(curveEvaluate(source, x), 4);
  });

  it('does not insert on top of an existing point', () => {
    expect(curveInsertPoint(bent(), 0).index).toBe(-1);
  });

  it('deletes inner points but never the ends', () => {
    const { curve } = curveInsertPoint(bent(), 0.5);
    expect(curveDeletePoint(curve, 0).points).toHaveLength(3);
    expect(curveDeletePoint(curve, 2).points).toHaveLength(3);
    expect(curveDeletePoint(curve, 1).points).toHaveLength(2);
  });

  it('straightens and flattens a segment', () => {
    const straight = curveSegmentStraighten(bent(), 0);
    expect(straight.segments[0]?.mode).toBe('linear');
    expect(curveEvaluate(straight, 0.5)).toBeCloseTo(0.5);
    const flat = curveSegmentFlatten(bent(), 0);
    expect(flat.points[0]?.y).toBeCloseTo(flat.points[1]?.y ?? -1);
  });

  it('mirrors left to right and flips upside down', () => {
    const source = bent();
    const mirrored = curveMirror(source);
    for (const x of [0.2, 0.5, 0.8]) expect(curveEvaluate(mirrored, x)).toBeCloseTo(curveEvaluate(source, 1 - x), 4);
    const flipped = curveFlip(source);
    for (const x of [0.2, 0.5, 0.8]) expect(curveEvaluate(flipped, x)).toBeCloseTo(1 - curveEvaluate(source, x), 4);
  });

  it('mirrors quadratic segments with their bend', () => {
    const straight = curveFromPolyline([
      [0, 0],
      [1, 0],
    ]);
    const source = curveMoveHandle(curveSegmentModeSet(straight, 0, 'quadratic'), 0, 'out', 0.2, 1);
    const mirrored = curveMirror(source);
    expect(curveEvaluate(mirrored, 0.7)).toBeCloseTo(curveEvaluate(source, 0.3), 4);
  });
});
