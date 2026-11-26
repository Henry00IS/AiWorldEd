import {
  CURVE_DETAIL_MAX,
  CURVE_DETAIL_MIN,
  CURVE_POINTS_MAX,
  curvePointCreate,
  curveSegmentLinear,
  type CurvePoint,
  type CurveSegment,
} from '@/curve/model/curve_model.js';
import { curveConstrain } from '@/curve/model/curve_constrain.js';
import { SOLID_SCRIPT_CURVE_SEGMENT_KINDS } from './solid_script_curve_members.js';
import { SolidScriptCurveValue, solidScriptCurveOf } from './solid_script_curve_value.js';
import { solidScriptNameKey } from './solid_script_name_key.js';
import {
  SolidScriptDictionary,
  solidScriptValueNumber,
  solidScriptValueNumbers,
  solidScriptValueText,
  type SolidScriptValue,
} from './solid_script_value.js';

/** How to call Curve, for messages. */
const SOLID_SCRIPT_CURVE_USAGE = 'Curve(points, segments)';

/**
 * Makes a Curve: from a list of points such as [[0, 0], [1, 1]], with an
 * optional list of segments as Dictionaries like .Segments gives; or from
 * another curve, a number for a flat line or a preset name.
 *
 * @param args Arguments.
 * @returns Curve.
 */
export function solidScriptCurveBuild(args: readonly SolidScriptValue[]): SolidScriptCurveValue {
  const [given, segments] = args;
  if (given instanceof SolidScriptCurveValue && segments === undefined) return given;
  if (!Array.isArray(given)) {
    const curve = solidScriptCurveOf(given ?? '');
    if (!curve)
      throw new Error(
        `${SOLID_SCRIPT_CURVE_USAGE} needs a list of points, such as [[0, 0], [1, 1]], not ${solidScriptValueText(given)}`,
      );
    return new SolidScriptCurveValue(curve);
  }
  const points = solidScriptCurveBuildPoints(given);
  if (segments !== undefined && !Array.isArray(segments))
    throw new Error(
      `${SOLID_SCRIPT_CURVE_USAGE} needs segments as a list, such as [C.Segments], not ${solidScriptValueText(segments)}`,
    );
  const built = points.slice(1).map((_, index) => solidScriptCurveBuildSegment(segments?.[index], points, index));
  return new SolidScriptCurveValue(curveConstrain({ points, segments: built }));
}

/**
 * Reads the points of a new curve: 2 to 256 points, each X from 0 to 1, left to
 * right, and Y from 0 to 1.
 *
 * @param list Points as given.
 * @returns Curve points with no handles.
 */
function solidScriptCurveBuildPoints(list: readonly SolidScriptValue[]): CurvePoint[] {
  if (list.length < 2 || list.length > CURVE_POINTS_MAX)
    throw new Error(`${SOLID_SCRIPT_CURVE_USAGE} needs 2 to ${CURVE_POINTS_MAX} points, not ${list.length}`);
  let left = 0;
  return list.map((entry) => {
    const numbers = solidScriptValueNumbers(entry);
    if (!numbers || numbers.length < 2 || numbers.length > 3)
      throw new Error(
        `${SOLID_SCRIPT_CURVE_USAGE} needs each point as [x, y], such as [0.5, 1], not ${solidScriptValueText(entry)}`,
      );
    const [x = 0, y = 0] = numbers;
    if (x < left || x > 1 || y < 0 || y > 1)
      throw new Error(
        `${SOLID_SCRIPT_CURVE_USAGE} needs X from 0 to 1, left to right, and Y from 0 to 1, not ${solidScriptValueText(entry)}`,
      );
    left = x;
    return curvePointCreate(x, y);
  });
}

/**
 * Reads one segment of a new curve from a Dictionary with its Kind, Handles and
 * Detail, and places its handles on its two points. A missing segment is
 * straight.
 *
 * @param given Segment as given.
 * @param points Points of the curve; their handles are set here.
 * @param index Segment number.
 * @returns Segment.
 */
function solidScriptCurveBuildSegment(given: SolidScriptValue, points: CurvePoint[], index: number): CurveSegment {
  if (given === undefined) return curveSegmentLinear();
  if (!(given instanceof SolidScriptDictionary))
    throw new Error(
      `${SOLID_SCRIPT_CURVE_USAGE} needs each segment as a Dictionary like .Segments gives, not ${solidScriptValueText(given)}`,
    );
  const segment: CurveSegment = { ...curveSegmentLinear(), mode: solidScriptCurveBuildKind(given) };
  const detail = solidScriptCurveBuildEntry(given, 'Detail');
  if (detail !== undefined) segment.detail = solidScriptCurveBuildDetail(detail);
  const handles = solidScriptCurveBuildEntry(given, 'Handles');
  if (handles !== undefined) solidScriptCurveBuildHandles(handles, points[index]!, points[index + 1]!);
  return segment;
}

/**
 * Reads one entry of a segment Dictionary by its name.
 *
 * @param dictionary Segment.
 * @param name Entry name, such as Kind.
 * @returns Value, or undefined when it has none.
 */
function solidScriptCurveBuildEntry(dictionary: SolidScriptDictionary, name: string): SolidScriptValue {
  return dictionary.entries.get(solidScriptNameKey(name))?.value;
}

/**
 * Reads the Kind of a segment: Linear, Quadratic or Bezier, in any case.
 *
 * @param dictionary Segment.
 * @returns Bend mode; Linear when it has no Kind.
 */
function solidScriptCurveBuildKind(dictionary: SolidScriptDictionary): CurveSegment['mode'] {
  const given = solidScriptCurveBuildEntry(dictionary, 'Kind');
  if (given === undefined) return 'linear';
  const word = solidScriptValueText(given).trim().toLowerCase();
  const found = Object.entries(SOLID_SCRIPT_CURVE_SEGMENT_KINDS).find(([, kind]) => kind.toLowerCase() === word);
  if (!found)
    throw new Error(
      `${SOLID_SCRIPT_CURVE_USAGE} needs a segment Kind of ${Object.values(SOLID_SCRIPT_CURVE_SEGMENT_KINDS).join(', ')}, not ${solidScriptValueText(given)}`,
    );
  return found[0] as CurveSegment['mode'];
}

/**
 * Reads the Detail of a segment: a whole number of straight pieces.
 *
 * @param given Detail as given.
 * @returns Detail.
 */
function solidScriptCurveBuildDetail(given: SolidScriptValue): number {
  const detail = solidScriptValueNumber(given);
  if (detail === undefined || !Number.isInteger(detail) || detail < CURVE_DETAIL_MIN || detail > CURVE_DETAIL_MAX)
    throw new Error(
      `${SOLID_SCRIPT_CURVE_USAGE} needs a segment Detail from ${CURVE_DETAIL_MIN} to ${CURVE_DETAIL_MAX}, not ${solidScriptValueText(given)}`,
    );
  return detail;
}

/**
 * Places the two handles of a segment from their places on the curve square.
 *
 * @param given Handles as given: the start handle, then the end handle.
 * @param start Point the segment starts at.
 * @param end Point the segment ends at.
 */
function solidScriptCurveBuildHandles(given: SolidScriptValue, start: CurvePoint, end: CurvePoint): void {
  const places = Array.isArray(given) ? given.map((entry) => solidScriptValueNumbers(entry)) : [];
  const [out, into] = places;
  if (places.length !== 2 || !out || !into || out.length < 2 || into.length < 2)
    throw new Error(
      `${SOLID_SCRIPT_CURVE_USAGE} needs segment Handles as two points, such as [[0.3, 1], [0.7, 0]], not ${solidScriptValueText(given)}`,
    );
  start.out = { x: out[0]! - start.x, y: out[1]! - start.y };
  end.in = { x: into[0]! - end.x, y: into[1]! - end.y };
}
