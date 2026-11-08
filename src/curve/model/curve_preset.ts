import { curveConstrain } from './curve_constrain.js';
import { CURVE_DETAIL_DEFAULT, curvePointCreate, type Curve, type CurveSegment } from './curve_model.js';

/**
 * One step of a preset: a straight line, a quadratic or a cubic Bezier to a
 * point.
 */
export type CurvePresetStep =
  | readonly ['L', number, number]
  | readonly ['Q', number, number, number, number]
  | readonly ['B', number, number, number, number, number, number];

/** A named curve preset. */
export interface CurvePreset {
  /** Stable id. */
  id: string;
  /** Menu label: a plain object name. */
  label: string;
  /** Hover help: where the shape comes from and where it fits in a level. */
  tooltip: string;
  /** Optional picker group. */
  group?: string;
  /** Start height at x 0. */
  start: number;
  /** Steps from left to right; the last one ends at x 1. */
  steps: readonly CurvePresetStep[];
  /**
   * Places of the base and top markers for this shape. They start switched off;
   * switching one on puts it exactly here.
   */
  markers: { bottom: number; top: number };
  /** X ranges whose segments get a square cross-section, as turnery blocks. */
  square?: readonly (readonly [number, number])[];
  /** X ranges and fillet fractions for rounded-square segments. */
  roundedSquare?: readonly (readonly [number, number, number])[];
  /**
   * Section settings over named profile ranges; twist is the total over each
   * range.
   */
  sections?: readonly CurvePresetSection[];
}

/**
 * Builds a curve from a preset, with both markers switched off at the preset's
 * places.
 *
 * @param preset Preset.
 * @returns Curve.
 */
export function curvePresetBuild(preset: CurvePreset): Curve {
  const curve: Curve = { points: [curvePointCreate(0, preset.start)], segments: [] };
  curve.markers = { parked: { ...preset.markers } };
  for (const step of preset.steps) curvePresetStepAppend(curve, step);
  curvePresetSectionsApply(curve, preset);
  return curveConstrain(curve);
}

/**
 * Appends one preset step.
 *
 * @param curve Curve under construction.
 * @param step Step.
 */
function curvePresetStepAppend(curve: Curve, step: CurvePresetStep): void {
  const start = curve.points[curve.points.length - 1];
  if (!start) return;
  const end = curvePointCreate(step[1], step[2]);
  if (step[0] === 'Q') start.out = { x: step[3] - start.x, y: step[4] - start.y };
  if (step[0] === 'B') {
    start.out = { x: step[3] - start.x, y: step[4] - start.y };
    end.in = { x: step[5] - end.x, y: step[6] - end.y };
  }
  const mode = step[0] === 'L' ? 'linear' : step[0] === 'Q' ? 'quadratic' : 'bezier';
  curve.points.push(end);
  curve.segments.push({ mode, detail: CURVE_DETAIL_DEFAULT });
}

/** Section settings over a normalized height range. */
export type CurvePresetSection = Omit<CurveSegment, 'mode' | 'detail'> & {
  /** Range start in profile coordinates. */
  from: number;
  /** Range end in profile coordinates. */
  to: number;
};

/**
 * Applies a preset's section ranges and distributes their total twist.
 *
 * @param curve Built profile curve, modified in place.
 * @param preset Source preset.
 */
function curvePresetSectionsApply(curve: Curve, preset: CurvePreset): void {
  curve.segments.forEach((segment, index) => {
    const from = curve.points[index]?.x ?? 0,
      to = curve.points[index + 1]?.x ?? 0;
    const middle = (from + to) / 2;
    if (preset.square?.some(([start, end]) => middle >= start && middle <= end)) segment.section = 'square';
    const rounded = preset.roundedSquare?.find(([start, end]) => middle >= start && middle <= end);
    if (rounded) {
      segment.section = 'rounded_square';
      segment.cornerRadius = rounded[2];
    }
    const range = preset.sections?.find((range) => middle >= range.from && middle <= range.to);
    if (!range) return;
    const { from: start, to: end, ...settings } = range;
    Object.assign(segment, settings);
    if (range.twist) segment.twist = (range.twist * (to - from)) / Math.max(end - start, 1e-9);
  });
}
