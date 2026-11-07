import { curveConstrain } from './curve_constrain.js';
import { CURVE_DETAIL_DEFAULT, curvePointCreate, type Curve } from './curve_model.js';

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
  /** Menu label. */
  label: string;
  /** Start height at x 0. */
  start: number;
  /** Steps from left to right; the last one ends at x 1. */
  steps: readonly CurvePresetStep[];
}

/**
 * Builds a curve from a preset.
 *
 * @param preset Preset.
 * @returns Curve.
 */
export function curvePresetBuild(preset: CurvePreset): Curve {
  const curve: Curve = { points: [curvePointCreate(0, preset.start)], segments: [] };
  for (const step of preset.steps) curvePresetStepAppend(curve, step);
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
