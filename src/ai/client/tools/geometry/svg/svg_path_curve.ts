import { CURVE_DETAIL_DEFAULT, curvePointCreate, type CurveLayer, type CurvePoint } from '@/curve/model/curve_model.js';

/** Number of arguments each SVG path command takes per segment. */
const SVG_PATH_ARITY: Readonly<Record<string, number>> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, Z: 0 };

/** Running state while a path is walked. */
interface SvgPathState {
  layer: CurveLayer;
  /**
   * Last control point of the previous C/S or Q/T, for the reflecting
   * shorthands.
   */
  control: { x: number; y: number; kind: 'cubic' | 'quadratic' } | null;
}

/**
 * Splits SVG path data into commands with their numbers.
 *
 * @param data Path data.
 * @returns Command letters and numbers.
 */
function svgPathTokenize(data: string): { command: string; numbers: number[] }[] {
  const pattern = /([MLHVCSQTZmlhvcsqtz])|([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)|([\s,]+)|(.)/g;
  const commands: { command: string; numbers: number[] }[] = [];
  for (const match of data.matchAll(pattern)) {
    if (match[4]) throw new Error(`unexpected "${match[4]}" in path; supported commands are M L H V C S Q T Z`);
    if (match[1]) commands.push({ command: match[1], numbers: [] });
    else if (match[2]) {
      const current = commands.at(-1);
      if (!current) throw new Error('path must start with M');
      current.numbers.push(Number(match[2]));
    }
  }
  return commands;
}

/**
 * Converts SVG path data to a curve line: M sets the start, L/H/V add straight
 * segments, Q/T quadratic and C/S cubic Bezier segments. Coordinates are curve
 * units with y up, not SVG's y down. Z is ignored.
 *
 * @param data SVG path data such as "M 0 0.6 L 0.2 0.6 C 0.3 0.6 0.4 0.4 0.5
 *   0.4 L 1 0.4".
 * @returns Curve line.
 */
export function svgPathCurve(data: string): CurveLayer {
  const commands = svgPathTokenize(data);
  const first = commands[0];
  if (!first || first.command.toUpperCase() !== 'M') throw new Error('path must start with M');
  const state: SvgPathState = { layer: { points: [], segments: [] }, control: null };
  for (const { command, numbers } of commands) svgPathCommandRun(state, command, numbers);
  if (state.layer.points.length < 2) throw new Error('path needs at least two points');
  return state.layer;
}

/**
 * Runs one command, repeating it for each argument group.
 *
 * @param state Walk state.
 * @param command Command letter.
 * @param numbers Its numbers.
 */
function svgPathCommandRun(state: SvgPathState, command: string, numbers: number[]): void {
  const upper = command.toUpperCase();
  const arity = SVG_PATH_ARITY[upper] ?? 0;
  if (arity === 0) return;
  if (numbers.length === 0 || numbers.length % arity !== 0)
    throw new Error(`${command} needs groups of ${arity} numbers`);
  for (let index = 0; index < numbers.length; index += arity) {
    const step = upper === 'M' && index > 0 ? 'L' : upper;
    svgPathSegmentAdd(state, step, command !== upper, numbers.slice(index, index + arity));
  }
}

/**
 * Adds one segment (or the start point for M).
 *
 * @param state Walk state.
 * @param command Upper-case command.
 * @param relative True for lower-case commands.
 * @param values The command's numbers.
 */
function svgPathSegmentAdd(state: SvgPathState, command: string, relative: boolean, values: number[]): void {
  const last = state.layer.points.at(-1);
  const origin = relative && last ? last : { x: 0, y: 0 };
  const xy = (offset: number): { x: number; y: number } => ({
    x: (values[offset] ?? 0) + origin.x,
    y: (values[offset + 1] ?? 0) + origin.y,
  });
  if (command === 'M') {
    if (last) throw new Error('only one M is supported: a curve is one connected line');
    state.layer.points.push(curvePointCreate(xy(0).x, xy(0).y));
    return;
  }
  if (!last) throw new Error('path must start with M');
  if (command === 'H') return svgPathLine(state, last, { x: (values[0] ?? 0) + (relative ? last.x : 0), y: last.y });
  if (command === 'V') return svgPathLine(state, last, { x: last.x, y: (values[0] ?? 0) + (relative ? last.y : 0) });
  if (command === 'L') return svgPathLine(state, last, xy(0));
  svgPathBend(state, last, command, xy);
}

/**
 * Adds a straight segment.
 *
 * @param state Walk state.
 * @param last Current end point.
 * @param end New end point.
 */
function svgPathLine(state: SvgPathState, last: CurvePoint, end: { x: number; y: number }): void {
  svgPathEndAdd(state, last, end);
  state.layer.segments.push({ mode: 'linear', detail: CURVE_DETAIL_DEFAULT });
  state.control = null;
}

/**
 * Adds a quadratic or cubic segment, reflecting the previous control point for
 * the S and T shorthands.
 *
 * @param state Walk state.
 * @param last Current end point.
 * @param command Q, T, C or S.
 * @param xy Reads an absolute point from the command's numbers.
 */
function svgPathBend(
  state: SvgPathState,
  last: CurvePoint,
  command: string,
  xy: (offset: number) => { x: number; y: number },
): void {
  const cubic = command === 'C' || command === 'S';
  const reflected =
    state.control && state.control.kind === (cubic ? 'cubic' : 'quadratic')
      ? { x: 2 * last.x - state.control.x, y: 2 * last.y - state.control.y }
      : { x: last.x, y: last.y };
  const first = command === 'C' || command === 'Q' ? xy(0) : reflected;
  const second = command === 'C' ? xy(2) : command === 'S' ? xy(0) : first;
  const end = command === 'C' ? xy(4) : command === 'T' ? xy(0) : xy(2);
  last.out = { x: first.x - last.x, y: first.y - last.y };
  const point = svgPathEndAdd(state, last, end);
  if (cubic) point.in = { x: second.x - end.x, y: second.y - end.y };
  state.layer.segments.push({ mode: cubic ? 'bezier' : 'quadratic', detail: CURVE_DETAIL_DEFAULT });
  state.control = { ...second, kind: cubic ? 'cubic' : 'quadratic' };
}

/**
 * Appends a segment end point, requiring x to move right.
 *
 * @param state Walk state.
 * @param last Current end point.
 * @param end New end point.
 * @returns Appended point.
 */
function svgPathEndAdd(state: SvgPathState, last: CurvePoint, end: { x: number; y: number }): CurvePoint {
  if (end.x <= last.x) throw new Error(`x must increase along the curve: ${end.x} follows ${last.x}`);
  const point = curvePointCreate(end.x, end.y);
  state.layer.points.push(point);
  return point;
}
