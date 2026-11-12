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
  it.each(['square', 'polygon'] as const)('round-trips %s parameters, corners and twist', (section) => {
    const curve = curveSegmentSectionSet(twistedCurve(), [0], section);
    expect(curveDecode(curveEncode(curve))).toEqual(curve);
    expect(curve.segments[0]?.twist).toBe(90);
    const cornered = curveSegmentPropertySet(
      curveSegmentPropertySet(curve, [0], 'cornerSize', 0.4),
      [0],
      'cornerSides',
      3,
    );
    expect(cornered.segments[0]).toMatchObject({ section, cornerSize: 0.4, cornerSides: 3, twist: 90 });
    expect(curveDecode(curveEncode(cornered))).toEqual(cornered);
  });

  it('stores square and polygon segments as compactly as before when their corners are sharp', () => {
    const square = curveSegmentSectionSet(
      curveFromPolyline([
        [0, 0.4],
        [1, 0.8],
      ]),
      [0],
      'square',
    );
    expect(JSON.parse(curveEncode(square)).segments).toEqual([['linear', square.segments[0]?.detail, 's']]);
    const cornered = curveSegmentPropertySet(square, [0], 'cornerSize', 0.25);
    expect(JSON.parse(curveEncode(cornered)).segments[0]).toEqual([
      'linear',
      square.segments[0]?.detail,
      's',
      0,
      0,
      0.25,
      4,
    ]);
  });
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
    const square = curveSegmentSectionSet(polygon, [0], 'square');
    expect(square.segments[0]?.polygonSides).toBeUndefined();
    expect(square.segments[0]?.cornerSize).toBeUndefined();
    expect(curveSegmentPropertySet(square, [0], 'twist', 10000).segments[0]?.twist).toBe(1440);
  });

  it('bounds corner size and faces, keeps corners across square and polygon and drops them for round', () => {
    const square = curveSegmentSectionSet(twistedCurve(), [0], 'square');
    const big = curveSegmentPropertySet(square, [0], 'cornerSize', 3);
    expect(big.segments[0]).toMatchObject({ cornerSize: 1, cornerSides: 4 });
    expect(curveSegmentPropertySet(big, [0], 'cornerSides', 40).segments[0]?.cornerSides).toBe(8);
    expect(curveSegmentPropertySet(big, [0], 'cornerSides', 0.2).segments[0]?.cornerSides).toBe(1);
    expect(curveSegmentPropertySet(big, [0], 'cornerSides', 2.6).segments[0]?.cornerSides).toBe(3);
    expect(curveSegmentSectionSet(big, [0], 'polygon').segments[0]).toMatchObject({ cornerSize: 1, cornerSides: 4 });
    const round = curveSegmentSectionSet(big, [0], 'round').segments[0];
    expect(round?.cornerSize).toBeUndefined();
    expect(round?.cornerSides).toBeUndefined();
    const sharp = curveSegmentPropertySet(big, [0], 'cornerSize', 0).segments[0];
    expect(sharp?.cornerSize).toBeUndefined();
    expect(sharp?.cornerSides).toBeUndefined();
  });
});
