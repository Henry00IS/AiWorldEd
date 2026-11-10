import { curveConstrain } from './curve_constrain.js';
import { CURVE_CROSS_ARM_DEFAULT } from './curve_section.js';
import {
  CURVE_DETAIL_DEFAULT,
  curvePointCreate,
  type Curve,
  type CurveLayer,
  type CurveMarkers,
  type CurveSegment,
} from './curve_model.js';

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
  /**
   * Height in metres the shape is drawn for. Shapes with one start with Base
   * and Top on, each fixed at its share of this height; shapes without it, such
   * as props that scale as a whole, start with both off.
   */
  height?: number;
  /** X ranges whose segments get a square cross-section, as turnery blocks. */
  square?: readonly (readonly [number, number])[];
  /**
   * Section settings over named profile ranges; twist is the total over each
   * range, while rotation turns every segment in the range by the same amount.
   */
  sections?: readonly CurvePresetSection[];
  /**
   * Secondary line that shapes the -X side of segments whose side mode is
   * custom, from its start height at x 0.
   */
  secondary?: { start: number; steps: readonly CurvePresetStep[] };
}

/**
 * Builds a curve from a preset. With a height its markers are on at the
 * preset's places, the base and top fixed at their share of that height;
 * without one both are off at the preset's places.
 *
 * @param preset Preset.
 * @returns Curve.
 */
export function curvePresetBuild(preset: CurvePreset): Curve {
  const curve: Curve = curvePresetLine(preset.start, preset.steps);
  curve.markers = curvePresetMarkers(preset);
  curvePresetSectionsApply(curve, preset);
  if (preset.secondary) curve.secondary = curvePresetLine(preset.secondary.start, preset.secondary.steps);
  return curveConstrain(curve);
}

/**
 * Returns the markers a preset starts with.
 *
 * @param preset Preset.
 * @returns Markers on with fixed heights, or parked.
 */
function curvePresetMarkers(preset: CurvePreset): CurveMarkers {
  if (preset.height === undefined) return { parked: { ...preset.markers } };
  const round = (value: number) => Math.round(value * 1000) / 1000;
  const heights = {
    bottom: round(preset.markers.bottom * preset.height),
    top: round((1 - preset.markers.top) * preset.height),
  };
  return { ...preset.markers, heights };
}

/**
 * Builds one profile line from a start height and steps.
 *
 * @param start Height at x 0.
 * @param steps Steps from left to right.
 * @returns Points and segments.
 */
function curvePresetLine(start: number, steps: readonly CurvePresetStep[]): CurveLayer {
  const line: CurveLayer = { points: [curvePointCreate(0, start)], segments: [] };
  for (const step of steps) curvePresetStepAppend(line, step);
  return line;
}

/**
 * Appends one preset step.
 *
 * @param curve Curve under construction.
 * @param step Step.
 */
function curvePresetStepAppend(curve: CurveLayer, step: CurvePresetStep): void {
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
 * Applies a preset's section ranges and distributes their total twist and bar
 * taper.
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
    const range = preset.sections?.find((range) => middle >= range.from && middle <= range.to);
    if (!range) return;
    const { from: start, to: end, ...settings } = range;
    Object.assign(segment, settings);
    if (range.twist) segment.twist = (range.twist * (to - from)) / Math.max(end - start, 1e-9);
    if (range.armWidthEnd !== undefined) Object.assign(segment, curvePresetTaper(range, from, to));
  });
}

/**
 * Shares a range's bar taper between its segments: each starts and ends at the
 * thickness the range has there, changing linearly over the whole range.
 *
 * @param range Section range with an end thickness.
 * @param from Segment start.
 * @param to Segment end.
 * @returns Start and end thickness of the segment.
 */
function curvePresetTaper(range: CurvePresetSection, from: number, to: number): Partial<CurveSegment> {
  const start = range.armWidth ?? CURVE_CROSS_ARM_DEFAULT;
  const end = range.armWidthEnd ?? start;
  const at = (x: number) => start + ((end - start) * (x - range.from)) / Math.max(range.to - range.from, 1e-9);
  return { armWidth: at(from), armWidthEnd: at(to) };
}
