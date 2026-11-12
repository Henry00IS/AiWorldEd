import type { CurveVector } from '@/curve/model/curve_model.js';
import type { CurveEditorView } from './curve_editor_view.js';
import { CURVE_UI_COLORS, CURVE_UI_FONT } from './curve_ui_style.js';

/** Decade grid levels in curve units, fine to coarse. */
const CURVE_EDITOR_GRID_DECADES = [0.01, 0.1, 1] as const;

/** Line spacing in pixels below which a grid level is hidden. */
const CURVE_EDITOR_GRID_FADE_START_PX = 4;

/** Line spacing in pixels from which a grid level is fully visible. */
const CURVE_EDITOR_GRID_FADE_END_PX = 16;

/** Label steps tried from fine to coarse, in curve units. */
const CURVE_EDITOR_GRID_LABEL_STEPS = [0.01, 0.1, 0.5, 1] as const;

/** Closest two value labels may sit on screen, in pixels. */
const CURVE_EDITOR_GRID_LABEL_MIN_PX = 56;

/** Tolerance when testing whether a value lies on a grid level. */
const CURVE_EDITOR_GRID_EPSILON = 1e-6;

/** One grid level with its spacing and current visibility. */
export interface CurveEditorGridLevel {
  /** Line spacing in curve units. */
  step: number;
  /** Opacity from 0 (hidden) to 1. */
  alpha: number;
}

/**
 * Lists the grid levels for a snap step: the snap step itself when snapping,
 * and every decade coarser than it; without snapping every decade.
 *
 * @param snapStep Snap step, or 0 when snapping is off.
 * @returns Line spacings from fine to coarse.
 */
export function curveEditorGridSteps(snapStep: number): number[] {
  const decades = CURVE_EDITOR_GRID_DECADES.filter(
    (step) => snapStep <= 0 || step >= snapStep - CURVE_EDITOR_GRID_EPSILON,
  );
  const steps = snapStep > 0 ? [snapStep, ...decades] : [...decades];
  return [...new Set(steps.map((step) => Number(step.toFixed(9))))].sort((left, right) => left - right);
}

/**
 * Returns how visible a grid level is for its spacing on screen: hidden while
 * lines would crowd closer than a few pixels, fading in as they spread.
 *
 * @param spacingPixels Distance between neighbouring lines in pixels.
 * @returns Opacity from 0 to 1.
 */
export function curveEditorGridAlpha(spacingPixels: number): number {
  const span = CURVE_EDITOR_GRID_FADE_END_PX - CURVE_EDITOR_GRID_FADE_START_PX;
  return Math.min(1, Math.max(0, (spacingPixels - CURVE_EDITOR_GRID_FADE_START_PX) / span));
}

/**
 * Builds the grid levels of a view. Both axes share one set of spacings, faded
 * by the denser axis, so every cell is a scaled copy of the unit square.
 *
 * @param view View.
 * @param snapStep Snap step, or 0 when snapping is off.
 * @returns Levels from fine to coarse; the coarsest is always fully visible.
 */
export function curveEditorGridLevels(view: CurveEditorView, snapStep: number): CurveEditorGridLevel[] {
  const density = view.pixelsPerUnit();
  const denser = Math.min(density.x, density.y);
  const steps = curveEditorGridSteps(snapStep);
  return steps.map((step, index) => ({
    step,
    alpha: index === steps.length - 1 ? 1 : curveEditorGridAlpha(step * denser),
  }));
}

/**
 * Finds the coarsest level a grid value lies on.
 *
 * @param value Grid value in curve units.
 * @param levels Levels from fine to coarse.
 * @returns Index of that level, or -1 when the value is on none.
 */
export function curveEditorGridLevelOf(value: number, levels: readonly CurveEditorGridLevel[]): number {
  for (let index = levels.length - 1; index >= 0; index--) {
    const ratio = value / (levels[index]?.step ?? 1);
    if (Math.abs(ratio - Math.round(ratio)) < CURVE_EDITOR_GRID_EPSILON) return index;
  }
  return -1;
}

/**
 * Picks the label spacing of one axis so labels never overlap.
 *
 * @param pixelsPerUnit Screen pixels per curve unit along that axis.
 * @returns Label spacing in curve units.
 */
export function curveEditorGridLabelStep(pixelsPerUnit: number): number {
  return CURVE_EDITOR_GRID_LABEL_STEPS.find((step) => step * pixelsPerUnit >= CURVE_EDITOR_GRID_LABEL_MIN_PX) ?? 1;
}

/**
 * Draws the grid inside the unit square: one line per value at the coarsest
 * level it lies on, faded by that level, then the value labels.
 *
 * @param context Canvas context.
 * @param view View.
 * @param snapStep Snap step, or 0 when snapping is off.
 */
export function curveEditorGridRender(
  context: CanvasRenderingContext2D,
  view: CurveEditorView,
  snapStep: number,
): void {
  const levels = curveEditorGridLevels(view, snapStep);
  const finest = levels.findIndex((level) => level.alpha > 0);
  const step = levels[finest]?.step ?? 1;
  const count = Math.round(1 / step);
  for (const axis of ['x', 'y'] as const)
    for (let index = 0; index <= count; index++)
      curveEditorGridLine(context, view, axis, Math.min(1, index * step), levels);
  curveEditorGridLabels(context, view);
}

/**
 * Draws one grid line across the unit square, faded by its level.
 *
 * @param context Canvas context.
 * @param view View.
 * @param axis Curve axis the value belongs to.
 * @param value Grid value.
 * @param levels Levels from fine to coarse.
 */
function curveEditorGridLine(
  context: CanvasRenderingContext2D,
  view: CurveEditorView,
  axis: 'x' | 'y',
  value: number,
  levels: readonly CurveEditorGridLevel[],
): void {
  const level = curveEditorGridLevelOf(value, levels);
  const alpha = levels[level]?.alpha ?? 0;
  if (alpha <= 0) return;
  const from = view.toScreen(axis === 'x' ? { x: value, y: 0 } : { x: 0, y: value });
  const to = view.toScreen(axis === 'x' ? { x: value, y: 1 } : { x: 1, y: value });
  const coarse = level === levels.length - 1 || levels[level]?.step === CURVE_EDITOR_GRID_DECADES[1];
  context.globalAlpha = alpha;
  curveEditorStrokeLine(context, from, to, coarse ? CURVE_UI_COLORS.gridMajor : CURVE_UI_COLORS.grid);
  context.globalAlpha = 1;
}

/**
 * Draws one crisp one-pixel line, snapped to the pixel grid.
 *
 * @param context Canvas context.
 * @param from Start in pixels.
 * @param to End in pixels.
 * @param color Stroke colour.
 */
export function curveEditorStrokeLine(
  context: CanvasRenderingContext2D,
  from: CurveVector,
  to: CurveVector,
  color: string,
): void {
  context.beginPath();
  context.moveTo(Math.round(from.x) + 0.5, Math.round(from.y) + 0.5);
  context.lineTo(Math.round(to.x) + 0.5, Math.round(to.y) + 0.5);
  context.strokeStyle = color;
  context.lineWidth = 1;
  context.stroke();
}

/**
 * Writes the value labels along the bottom and left edges of the unit square;
 * the shared origin is labelled once.
 *
 * @param context Canvas context.
 * @param view View.
 */
function curveEditorGridLabels(context: CanvasRenderingContext2D, view: CurveEditorView): void {
  const density = view.pixelsPerUnit();
  for (const axis of ['x', 'y'] as const) {
    const step = curveEditorGridLabelStep(axis === 'x' ? density.x : density.y);
    const count = Math.round(1 / step);
    for (let index = axis === 'x' ? 0 : 1; index <= count; index++) {
      const value = Math.min(1, index * step);
      curveEditorGridLabel(context, view.toScreen(axis === 'x' ? { x: value, y: 0 } : { x: 0, y: value }), value, axis);
    }
  }
}

/**
 * Writes a grid value next to the start of its line.
 *
 * @param context Canvas context.
 * @param at Line start in pixels.
 * @param value Grid value.
 * @param axis Curve axis the value belongs to.
 */
function curveEditorGridLabel(
  context: CanvasRenderingContext2D,
  at: CurveVector,
  value: number,
  axis: 'x' | 'y',
): void {
  context.font = CURVE_UI_FONT;
  context.fillStyle = CURVE_UI_COLORS.label;
  context.textBaseline = 'top';
  context.fillText(`${axis}${Number(value.toFixed(3))}`, at.x + 3, at.y + 2);
}
