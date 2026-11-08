import { describe, expect, it } from 'vitest';
import { curveFromPolyline } from '@/curve/model/curve_model.js';
import { curveEncode, curveDecode } from '@/curve/model/curve_codec.js';
import {
  curveSegmentSectionSet,
  curveSegmentPropertySet,
  curveInsertPoint,
  curveDeletePoint,
  curveMirror,
} from '@/curve/model/curve_edit.js';

/**
 * Builds a single straight segment with a quarter-turn of rotation.
 *
 * @returns A twisted polygon curve.
 */
function twistedCurve() {
  return curveSegmentPropertySet(
    curveSegmentSectionSet(
      curveFromPolyline([
        [0, 0.4],
        [1, 0.8],
      ]),
      [0],
      'polygon',
    ),
    [0],
    'twist',
    90,
  );
}

/**
 * Section properties are authored curve data, including correct editing
 * semantics.
 */
describe('curve section properties', () => {
  it.each(['square', 'rounded_square', 'chamfered_square', 'polygon'] as const)(
    'round-trips %s parameters and twist',
    (section) => {
      const curve = curveSegmentSectionSet(twistedCurve(), [0], section);
      expect(curveDecode(curveEncode(curve))).toEqual(curve);
      expect(curve.segments[0]?.twist).toBe(90);
    },
  );
  it('splits twist without doubling it, rejoins it on deletion and reverses handedness on Mirror', () => {
    const split = curveInsertPoint(twistedCurve(), 0.25).curve;
    expect(split.segments[0]?.twist).toBeCloseTo(22.5, 6);
    expect(split.segments[1]?.twist).toBeCloseTo(67.5, 6);
    expect(curveDeletePoint(split, 1).segments[0]?.twist).toBeCloseTo(90, 6);
    expect(curveMirror(split).segments.map((segment) => segment.twist)).toEqual(
      split.segments.map((segment) => -(segment.twist ?? 0)).reverse(),
    );
  });
  it('removes irrelevant parameters and bounds twist and polygon choices', () => {
    const polygon = curveSegmentPropertySet(twistedCurve(), [0], 'polygonSides', 200);
    expect(polygon.segments[0]?.polygonSides).toBe(12);
    const chamfer = curveSegmentSectionSet(polygon, [0], 'chamfered_square');
    expect(chamfer.segments[0]?.polygonSides).toBeUndefined();
    expect(chamfer.segments[0]?.chamferAmount).toBe(0.3);
    expect(curveSegmentPropertySet(chamfer, [0], 'twist', 10000).segments[0]?.twist).toBe(1440);
  });
});
