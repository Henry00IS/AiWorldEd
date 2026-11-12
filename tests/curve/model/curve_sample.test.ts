import { describe, expect, it } from 'vitest';
import { curveFromPolyline } from '@/curve/model/curve_model.js';
import { curveSegmentDetailSet, curveSegmentModeSet } from '@/curve/model/curve_edit.js';
import { curveMoveHandle } from '@/curve/model/curve_constrain.js';
import { curveEvaluate, curveSample } from '@/curve/model/curve_sample.js';

describe('curve sampling', () => {
  it('keeps straight segments as single pieces and vertical steps as equal x', () => {
    const curve = curveFromPolyline([
      [0, 1],
      [0.5, 1],
      [0.5, 0.5],
      [1, 0.5],
    ]);
    const polyline = curveSample(curve);
    expect(polyline).toHaveLength(curve.points.length);
    expect(polyline[1]?.x).toBe(polyline[2]?.x);
    expect(curveEvaluate(curve, 0.25)).toBeCloseTo(1);
    expect(curveEvaluate(curve, 0.75)).toBeCloseTo(0.5);
  });

  it('splits bent segments into detail pieces that stay left to right', () => {
    const straight = curveFromPolyline([
      [0, 0],
      [1, 1],
    ]);
    const bent = curveMoveHandle(curveSegmentModeSet(straight, 0, 'bezier'), 0, 'out', 0.1, 0.9);
    const detailed = curveSegmentDetailSet(bent, 0, 12);
    const polyline = curveSample(detailed);
    expect(polyline).toHaveLength(13);
    for (let index = 1; index < polyline.length; index++)
      expect(polyline[index]?.x ?? 0).toBeGreaterThanOrEqual(polyline[index - 1]?.x ?? 0);
    expect(curveEvaluate(detailed, 0.5)).toBeGreaterThan(0.5);
  });

  it('bends quadratic segments through their control', () => {
    const straight = curveFromPolyline([
      [0, 0],
      [1, 0],
    ]);
    const quadratic = curveMoveHandle(curveSegmentModeSet(straight, 0, 'quadratic'), 0, 'out', 0.5, 1);
    expect(curveEvaluate(quadratic, 0.5)).toBeCloseTo(0.5);
  });
});
