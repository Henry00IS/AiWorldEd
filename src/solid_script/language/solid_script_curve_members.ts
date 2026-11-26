import type { Curve, CurvePoint, CurveSegment, CurveSegmentMode } from '@/curve/model/curve_model.js';
import { solidScriptCurveNumber } from './solid_script_curve_value.js';
import { solidScriptNameKey } from './solid_script_name_key.js';
import { SolidScriptDictionary, type SolidScriptValue } from './solid_script_value.js';

/** Kind each segment mode shows as, the way the curve editor names it. */
export const SOLID_SCRIPT_CURVE_SEGMENT_KINDS: Readonly<Record<CurveSegmentMode, string>> = {
  linear: 'Linear',
  quadratic: 'Quadratic',
  bezier: 'Bezier',
};

/**
 * Writes a curve point or handle place as a flat vector.
 *
 * @param x Place from left (0) to right (1).
 * @param y Height from bottom (0) to top (1).
 * @returns Vector.
 */
function solidScriptCurveVector(x: number, y: number): number[] {
  return [solidScriptCurveNumber(x), solidScriptCurveNumber(y)];
}

/**
 * Describes one segment as a Dictionary: its Kind, Start and End points, the
 * places of its two Handles and its Detail.
 *
 * @param segment Segment.
 * @param start Point it starts at.
 * @param end Point it ends at.
 * @returns Dictionary.
 */
function solidScriptCurveSegmentDictionary(
  segment: CurveSegment,
  start: CurvePoint,
  end: CurvePoint,
): SolidScriptDictionary {
  const values: [string, SolidScriptValue][] = [
    ['Kind', SOLID_SCRIPT_CURVE_SEGMENT_KINDS[segment.mode]],
    ['Start', solidScriptCurveVector(start.x, start.y)],
    ['End', solidScriptCurveVector(end.x, end.y)],
    [
      'Handles',
      [
        solidScriptCurveVector(start.x + start.out.x, start.y + start.out.y),
        solidScriptCurveVector(end.x + end.in.x, end.y + end.in.y),
      ],
    ],
    ['Detail', segment.detail],
  ];
  return new SolidScriptDictionary(new Map(values.map(([name, value]) => [solidScriptNameKey(name), { name, value }])));
}

/**
 * Reads a member of a curve: .Points as flat vectors, .Length as the number of
 * points and .Segments as one Dictionary per segment.
 *
 * @param curve Curve.
 * @param member Member, folded.
 * @returns Value, or undefined when curves have no such member.
 */
export function solidScriptCurveMember(curve: Curve, member: string): SolidScriptValue {
  if (member === 'points') return curve.points.map((point) => solidScriptCurveVector(point.x, point.y));
  if (member === 'length') return curve.points.length;
  if (member === 'segments')
    return curve.segments.map((segment, index) =>
      solidScriptCurveSegmentDictionary(segment, curve.points[index]!, curve.points[index + 1]!),
    );
  return undefined;
}
