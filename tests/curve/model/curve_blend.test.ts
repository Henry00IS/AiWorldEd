import { describe, expect, it } from 'vitest';
import { curveCanonical, curveDecode, curveEncode } from '@/curve/model/curve_codec.js';
import { curveSegmentSectionSet } from '@/curve/model/curve_edit.js';
import { curveEquals, curveFromPolyline, type Curve, type CurveSegment } from '@/curve/model/curve_model.js';
import {
  curveBlendJoint,
  curveSegmentBlendable,
  curveSegmentBlendEnds,
  curveSegmentBlendSet,
} from '@/curve/model/curve_blend.js';

/** A nail profile as saved before Blend existed. */
const OLD_NAIL =
  '{"points":[[0,0,0,0,0,0],[0.06,0.52,0,0,0,0],[0.95,0.52,0,0,0,0],[0.965,0.7,0,0,0,0],[0.965,1,0,0,0,0],[0.985,1,0,0,0,0],[1,0.88,0,0,0,0]],"segments":[["linear",8,"s"],["linear",8],["linear",8],["linear",8],["linear",8],["linear",8]],"markers":{"parked":{"bottom":0.06,"top":0.95}}}';

/**
 * Builds a straight profile through points and gives its segments settings.
 *
 * @param points Points as [x, y].
 * @param segments Settings per segment.
 * @returns Curve.
 */
function profile(points: [number, number][], segments: Partial<CurveSegment>[]): Curve {
  const curve = curveFromPolyline(points);
  segments.forEach((settings, index) => Object.assign(curve.segments[index]!, settings));
  return curve;
}

describe('curve blend joints', () => {
  it('finds section changes that rise along the curve and have a width', () => {
    const rising = profile(
      [
        [0, 0.5],
        [0.3, 0.5],
        [1, 0.5],
      ],
      [{ section: 'square' }, {}],
    );
    expect(curveBlendJoint(rising, 1)).toBe(true);
    expect(curveBlendJoint(rising, 0)).toBe(false);
    expect(curveBlendJoint(rising, 2)).toBe(false);
    const step = profile(
      [
        [0, 0.5],
        [0.3, 0.5],
        [0.3, 0.8],
        [1, 0.8],
      ],
      [{ section: 'square' }, { section: 'square' }, {}],
    );
    expect(curveBlendJoint(step, 2)).toBe(false);
    const apex = profile(
      [
        [0, 0.5],
        [0.5, 0],
        [1, 0.5],
      ],
      [{ section: 'square' }, {}],
    );
    expect(curveBlendJoint(apex, 1)).toBe(false);
  });

  it('ignores twist and counts outline settings such as bar thickness', () => {
    const points: [number, number][] = [
      [0, 0.5],
      [0.5, 0.5],
      [1, 0.5],
    ];
    expect(curveBlendJoint(profile(points, [{ section: 'square', twist: 1 }, { section: 'square' }]), 1)).toBe(false);
    expect(
      curveBlendJoint(
        profile(points, [
          { section: 'bar', armWidth: 0.2 },
          { section: 'bar', armWidth: 0.4 },
        ]),
        1,
      ),
    ).toBe(true);
    expect(
      curveBlendJoint(
        profile(points, [
          { section: 'bar', armWidth: 0.2, armWidthEnd: 0.4 },
          { section: 'bar', armWidth: 0.4 },
        ]),
        1,
      ),
    ).toBe(false);
  });

  it('morphs a blending segment only at the ends that meet a different outline', () => {
    const curve = profile(
      [
        [0, 0.5],
        [0.3, 0.5],
        [0.6, 0.5],
        [1, 0.5],
      ],
      [{ section: 'square' }, { blend: true }, {}],
    );
    expect(curveSegmentBlendEnds(curve, 1)).toEqual({ start: true, end: false });
    expect(curveSegmentBlendEnds(curve, 0)).toEqual({ start: false, end: false });
    expect(curveSegmentBlendable(curve, 1)).toBe(true);
    expect(curveSegmentBlendable(curve, 2)).toBe(false);
  });
});

describe('curve blend toggle', () => {
  it('sets and clears Blend, leaving no field behind when off', () => {
    const base = profile(
      [
        [0, 0.5],
        [0.3, 0.5],
        [1, 0.5],
      ],
      [{ section: 'square' }, {}],
    );
    const on = curveSegmentBlendSet(base, [1, 7], true);
    expect(on.segments[1]?.blend).toBe(true);
    expect(base.segments[1]?.blend).toBeUndefined();
    const off = curveSegmentBlendSet(on, [1], false);
    expect('blend' in off.segments[1]!).toBe(false);
    expect(curveEquals(off, base)).toBe(true);
    expect(curveEquals(on, base)).toBe(false);
  });

  it('turns Blend on for the shorter segment where a section change appears', () => {
    const points: [number, number][] = [
      [0, 0.5],
      [0.8, 0.5],
      [1, 0.5],
    ];
    const longSquare = curveSegmentSectionSet(curveFromPolyline(points), [0], 'square');
    expect(longSquare.segments.map((segment) => segment.blend ?? false)).toEqual([false, true]);
    const shortTip = curveSegmentSectionSet(curveFromPolyline(points), [1], 'square');
    expect(shortTip.segments.map((segment) => segment.blend ?? false)).toEqual([false, true]);
    const tie = curveSegmentSectionSet(
      curveFromPolyline([
        [0, 0.5],
        [0.5, 0.5],
        [1, 0.5],
      ]),
      [1],
      'square',
    );
    expect(tie.segments.map((segment) => segment.blend ?? false)).toEqual([false, true]);
  });

  it('leaves Blend alone where one segment blends already or nothing changes', () => {
    const points: [number, number][] = [
      [0, 0.5],
      [0.8, 0.5],
      [1, 0.5],
    ];
    const lower = curveSegmentBlendSet(curveFromPolyline(points), [0], true);
    expect(curveSegmentSectionSet(lower, [0], 'square').segments[1]?.blend).toBeUndefined();
    const same = curveSegmentSectionSet(curveFromPolyline(points), [0, 1], 'square');
    expect(same.segments.some((segment) => segment.blend)).toBe(false);
    const vertical = curveSegmentSectionSet(
      curveFromPolyline([
        [0, 0.5],
        [0.5, 0.5],
        [0.5, 0.8],
        [1, 0.8],
      ]),
      [0, 1],
      'square',
    );
    expect(vertical.segments.some((segment) => segment.blend)).toBe(false);
  });
});

describe('curve blend codec', () => {
  it('saves Blend and round-trips it with and without a bar end thickness', () => {
    const curve = profile(
      [
        [0, 0.5],
        [0.4, 0.5],
        [0.7, 0.5],
        [1, 0.5],
      ],
      [{ section: 'bar', armWidth: 0.3, armWidthEnd: 0 }, { blend: true }, { section: 'square', blend: true }],
    );
    const decoded = curveDecode(curveEncode(curve))!;
    expect(curveEquals(decoded, curve)).toBe(true);
    expect(decoded.segments.map((segment) => segment.blend ?? false)).toEqual([false, true, true]);
    expect(decoded.segments[0]?.armWidthEnd).toBe(0);
    expect(curveEncode(curveSegmentBlendSet(curve, [1, 2], false))).not.toContain('null');
  });

  it('reads profiles saved before Blend unchanged and without it', () => {
    expect(curveCanonical(OLD_NAIL)).toBe(OLD_NAIL);
    const old = curveDecode(OLD_NAIL)!;
    expect(old.segments.some((segment) => 'blend' in segment)).toBe(false);
    expect(curveEncode(old)).toBe(OLD_NAIL);
  });
});
