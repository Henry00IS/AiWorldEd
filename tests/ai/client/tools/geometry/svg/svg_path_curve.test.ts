import { describe, expect, it } from 'vitest';
import { svgPathCurve } from '@/ai/client/tools/geometry/svg/svg_path_curve.js';

describe('svgPathCurve', () => {
  it('maps straight, relative and cubic commands to points, handles and segment modes', () => {
    const layer = svgPathCurve('M0 0.6 h0.2 C0.3,0.6 0.4,0.4 0.5,0.4 L1 .4');
    expect(layer.points.map((point) => [point.x, point.y])).toEqual([
      [0, 0.6],
      [0.2, 0.6],
      [0.5, 0.4],
      [1, 0.4],
    ]);
    expect(layer.segments.map((segment) => segment.mode)).toEqual(['linear', 'bezier', 'linear']);
    expect(layer.points[1]?.out.x).toBeCloseTo(0.1);
    expect(layer.points[2]?.in.x).toBeCloseTo(-0.1);
  });

  it('reflects the previous control point for S and T', () => {
    const layer = svgPathCurve('M0 0 Q0.25 1 0.5 0.5 T1 0');
    expect(layer.segments.map((segment) => segment.mode)).toEqual(['quadratic', 'quadratic']);
    expect(layer.points[1]?.out.x).toBeCloseTo(0.25);
    expect(layer.points[1]?.out.y).toBeCloseTo(-0.5);
  });

  it('refuses paths a curve cannot hold', () => {
    expect(() => svgPathCurve('L 1 1')).toThrow(/start with M/);
    expect(() => svgPathCurve('M 0 0 L 0.5 0 L 0.4 1')).toThrow(/x must increase/);
    expect(() => svgPathCurve('M 0 0 A 1 1 0 0 1 1 1')).toThrow(/unexpected "A"/);
    expect(() => svgPathCurve('M 0 0 L 1')).toThrow(/groups of 2/);
  });
});
