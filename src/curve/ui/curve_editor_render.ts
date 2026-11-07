import { curveHandlePosition, type Curve, type CurveVector } from '@/curve/model/curve_model.js';
import { curveSegmentSample } from '@/curve/model/curve_sample.js';
import { curveDrawLine } from './curve_draw.js';
import { curveEditorVisibleHandles, type CurveEditorHit, type CurveEditorSelection } from './curve_editor_hit.js';
import type { CurveEditorView } from './curve_editor_view.js';
import { CURVE_UI_COLORS, CURVE_UI_FONT } from './curve_ui_style.js';

/** Grid spacings tried from fine to coarse, in curve units. */
const CURVE_EDITOR_GRID_STEPS = [0.01, 0.02, 0.025, 0.05, 0.1, 0.125, 0.25, 0.5, 1] as const;

/** Closest grid lines may sit on screen, in pixels. */
const CURVE_EDITOR_GRID_MIN_PX = 14;

/** What the editor canvas shows. */
export interface CurveEditorScene {
  /** Curve being edited. */
  curve: Curve;
  /** Selected point or segment. */
  selection: CurveEditorSelection;
  /** Part under the pointer. */
  hover: CurveEditorHit;
  /** Snap step, shown as the grid when snapping is on; 0 when off. */
  snapStep: number;
}

/**
 * Draws the whole editor canvas.
 *
 * @param context Canvas context in CSS pixels.
 * @param view View.
 * @param scene Curve, selection and grid.
 */
export function curveEditorRender(
  context: CanvasRenderingContext2D,
  view: CurveEditorView,
  scene: CurveEditorScene,
): void {
  const { width, height } = view.size();
  context.fillStyle = '#141414';
  context.fillRect(0, 0, width, height);
  const corner = view.toScreen({ x: 0, y: 0 });
  const far = view.toScreen({ x: 1, y: 1 });
  context.fillStyle = CURVE_UI_COLORS.background;
  context.fillRect(
    Math.min(corner.x, far.x),
    Math.min(corner.y, far.y),
    Math.abs(far.x - corner.x),
    Math.abs(far.y - corner.y),
  );
  curveEditorRenderGrid(context, view, scene.snapStep);
  curveDrawLine(context, scene.curve, (point) => view.toScreen(point), 2);
  curveEditorRenderSelectedSegment(context, view, scene);
  curveEditorRenderHandles(context, view, scene);
  curveEditorRenderPoints(context, view, scene);
}

/**
 * Picks a grid spacing that is not too dense on screen.
 *
 * @param pixelsPerUnit Screen pixels per curve unit.
 * @param snapStep Snap step, preferred when visible; 0 when off.
 * @returns Spacing in curve units.
 */
export function curveEditorGridStep(pixelsPerUnit: number, snapStep: number): number {
  if (snapStep > 0 && snapStep * pixelsPerUnit >= CURVE_EDITOR_GRID_MIN_PX) return snapStep;
  return CURVE_EDITOR_GRID_STEPS.find((step) => step * pixelsPerUnit >= CURVE_EDITOR_GRID_MIN_PX) ?? 1;
}

/**
 * Draws grid lines inside the unit square, labelled at 0, 0.5 and 1.
 *
 * @param context Canvas context.
 * @param view View.
 * @param snapStep Snap step or 0.
 */
function curveEditorRenderGrid(context: CanvasRenderingContext2D, view: CurveEditorView, snapStep: number): void {
  const density = view.pixelsPerUnit();
  for (const axis of ['x', 'y'] as const) {
    const step = curveEditorGridStep(axis === 'x' ? density.x : density.y, snapStep);
    const count = Math.round(1 / step);
    for (let index = 0; index <= count; index++) {
      const value = Math.min(1, index * step);
      const major = Math.abs(value * 4 - Math.round(value * 4)) < 1e-9;
      const from = view.toScreen(axis === 'x' ? { x: value, y: 0 } : { x: 0, y: value });
      const to = view.toScreen(axis === 'x' ? { x: value, y: 1 } : { x: 1, y: value });
      curveEditorStrokeLine(context, from, to, major ? CURVE_UI_COLORS.gridMajor : CURVE_UI_COLORS.grid);
      if (major) curveEditorRenderLabel(context, from, value, axis);
    }
  }
}

/**
 * Draws one crisp one-pixel line.
 *
 * @param context Canvas context.
 * @param from Start in pixels.
 * @param to End in pixels.
 * @param color Stroke colour.
 */
function curveEditorStrokeLine(
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
 * Writes a grid value next to the start of its line.
 *
 * @param context Canvas context.
 * @param at Line start in pixels.
 * @param value Grid value.
 * @param axis Curve axis the value belongs to.
 */
function curveEditorRenderLabel(
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

/**
 * Highlights the selected segment.
 *
 * @param context Canvas context.
 * @param view View.
 * @param scene Editor scene.
 */
function curveEditorRenderSelectedSegment(
  context: CanvasRenderingContext2D,
  view: CurveEditorView,
  scene: CurveEditorScene,
): void {
  const selection = scene.selection;
  const start = selection?.kind === 'segment' ? scene.curve.points[selection.index] : undefined;
  if (!selection || !start) return;
  const points = [start, ...curveSegmentSample(scene.curve, selection.index)].map((point) => view.toScreen(point));
  context.beginPath();
  points.forEach((point, index) => (index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y)));
  context.strokeStyle = CURVE_UI_COLORS.selected;
  context.lineWidth = 3.5;
  context.stroke();
}

/**
 * Draws the handles of the selection with their stems.
 *
 * @param context Canvas context.
 * @param view View.
 * @param scene Editor scene.
 */
function curveEditorRenderHandles(
  context: CanvasRenderingContext2D,
  view: CurveEditorView,
  scene: CurveEditorScene,
): void {
  for (const handle of curveEditorVisibleHandles(scene.curve, scene.selection)) {
    const point = scene.curve.points[handle.index];
    if (!point) continue;
    const base = view.toScreen(point);
    const tip = view.toScreen(curveHandlePosition(point, handle.side));
    curveEditorStrokeLine(context, base, tip, CURVE_UI_COLORS.handle);
    const hovered =
      scene.hover?.kind === 'handle' && scene.hover.index === handle.index && scene.hover.side === handle.side;
    context.beginPath();
    context.arc(tip.x, tip.y, hovered ? 5 : 4, 0, Math.PI * 2);
    context.fillStyle = CURVE_UI_COLORS.handle;
    context.fill();
  }
}

/**
 * Draws the curve points; end points are diamonds because they only move
 * vertically.
 *
 * @param context Canvas context.
 * @param view View.
 * @param scene Editor scene.
 */
function curveEditorRenderPoints(
  context: CanvasRenderingContext2D,
  view: CurveEditorView,
  scene: CurveEditorScene,
): void {
  const last = scene.curve.points.length - 1;
  scene.curve.points.forEach((point, index) => {
    const at = view.toScreen(point);
    const selected = scene.selection?.kind === 'point' && scene.selection.index === index;
    const hovered = scene.hover?.kind === 'point' && scene.hover.index === index;
    const size = hovered || selected ? 5 : 4;
    context.save();
    context.translate(at.x, at.y);
    if (index === 0 || index === last) context.rotate(Math.PI / 4);
    context.fillStyle = selected ? CURVE_UI_COLORS.selected : CURVE_UI_COLORS.point;
    context.fillRect(-size, -size, size * 2, size * 2);
    context.strokeStyle = '#000000';
    context.lineWidth = 1;
    context.strokeRect(-size, -size, size * 2, size * 2);
    context.restore();
  });
}
