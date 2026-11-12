import { curveGroupBounds } from '@/curve/model/curve_group.js';
import type { Curve, CurveVector } from '@/curve/model/curve_model.js';
import type { CurveEditorGrip } from './curve_editor_session.js';
import type { CurveEditorView } from './curve_editor_view.js';
import { CURVE_UI_COLORS } from './curve_ui_style.js';

/** Gap between the selected points and their scale box, in pixels. */
const CURVE_EDITOR_GROUP_PAD_PX = 10;

/** Half size of a scale grip in pixels. */
const CURVE_EDITOR_GRIP_PX = 4;

/** Pick radius of a scale grip in pixels. */
const CURVE_EDITOR_GRIP_PICK_PX = 7;

/** A rubber-band selection rectangle in canvas pixels. */
export interface CurveEditorMarquee {
  /** Where the drag started. */
  from: CurveVector;
  /** Where the pointer is now. */
  to: CurveVector;
}

/** Screen rectangle of the scale box. */
interface CurveEditorGroupRect {
  /** Left edge. */
  left: number;
  /** Right edge. */
  right: number;
  /** Top edge. */
  top: number;
  /** Bottom edge. */
  bottom: number;
}

/**
 * Returns the padded screen box around the selected points, or null for fewer
 * than two points.
 *
 * @param curve Curve.
 * @param view View.
 * @param points Selected point indices.
 * @returns Box, or null.
 */
function curveEditorGroupRect(
  curve: Curve,
  view: CurveEditorView,
  points: readonly number[],
): CurveEditorGroupRect | null {
  const box = points.length >= 2 ? curveGroupBounds(curve, points) : null;
  if (!box) return null;
  const a = view.toScreen(box.min);
  const b = view.toScreen(box.max);
  const pad = CURVE_EDITOR_GROUP_PAD_PX;
  return {
    left: Math.min(a.x, b.x) - pad,
    right: Math.max(a.x, b.x) + pad,
    top: Math.min(a.y, b.y) - pad,
    bottom: Math.max(a.y, b.y) + pad,
  };
}

/**
 * Returns the eight grips of a box with their screen sides.
 *
 * @param rect Box.
 * @returns Grip positions and screen sides (-1, 0, 1 per axis).
 */
function curveEditorGroupGrips(rect: CurveEditorGroupRect): { at: CurveVector; i: number; j: number }[] {
  const grips: { at: CurveVector; i: number; j: number }[] = [];
  const xs = [rect.left, (rect.left + rect.right) / 2, rect.right];
  const ys = [rect.top, (rect.top + rect.bottom) / 2, rect.bottom];
  for (let i = -1; i <= 1; i++)
    for (let j = -1; j <= 1; j++) if (i || j) grips.push({ at: { x: xs[i + 1] ?? 0, y: ys[j + 1] ?? 0 }, i, j });
  return grips;
}

/**
 * Turns a screen side into the curve edges it drags, whichever way the view is
 * turned.
 *
 * @param view View.
 * @param i Screen horizontal side.
 * @param j Screen vertical side.
 * @returns Curve grip.
 */
function curveEditorGripFromScreen(view: CurveEditorView, i: number, j: number): CurveEditorGrip {
  const origin = view.toScreen({ x: 0, y: 0 });
  const ex = view.toScreen({ x: 1, y: 0 });
  const ey = view.toScreen({ x: 0, y: 1 });
  const side = (axis: CurveVector) => Math.sign(i * (axis.x - origin.x) + j * (axis.y - origin.y)) as -1 | 0 | 1;
  return { x: side(ex), y: side(ey) };
}

/**
 * Returns the scale grip under the pointer.
 *
 * @param curve Curve.
 * @param view View.
 * @param points Selected point indices.
 * @param screen Pointer in pixels.
 * @returns Grip, or null.
 */
export function curveEditorGripHit(
  curve: Curve,
  view: CurveEditorView,
  points: readonly number[],
  screen: CurveVector,
): CurveEditorGrip | null {
  const rect = curveEditorGroupRect(curve, view, points);
  if (!rect) return null;
  const grip = curveEditorGroupGrips(rect).find(
    ({ at }) => Math.hypot(at.x - screen.x, at.y - screen.y) <= CURVE_EDITOR_GRIP_PICK_PX,
  );
  return grip ? curveEditorGripFromScreen(view, grip.i, grip.j) : null;
}

/**
 * Returns the points inside a marquee.
 *
 * @param curve Curve.
 * @param view View.
 * @param marquee Rectangle in pixels.
 * @returns Point indices.
 */
export function curveEditorMarqueePick(curve: Curve, view: CurveEditorView, marquee: CurveEditorMarquee): number[] {
  const [left, right] = [Math.min(marquee.from.x, marquee.to.x), Math.max(marquee.from.x, marquee.to.x)];
  const [top, bottom] = [Math.min(marquee.from.y, marquee.to.y), Math.max(marquee.from.y, marquee.to.y)];
  const inside = (at: CurveVector) => at.x >= left && at.x <= right && at.y >= top && at.y <= bottom;
  return curve.points.flatMap((point, index) => (inside(view.toScreen(point)) ? [index] : []));
}

/**
 * Draws the scale box with its grips around two or more selected points, and
 * the marquee while one is dragged.
 *
 * @param context Canvas context.
 * @param view View.
 * @param scene Curve, selected points and marquee.
 */
export function curveEditorGroupRender(
  context: CanvasRenderingContext2D,
  view: CurveEditorView,
  scene: { curve: Curve; points: readonly number[]; marquee: CurveEditorMarquee | null },
): void {
  const rect = curveEditorGroupRect(scene.curve, view, scene.points);
  context.save();
  if (rect) {
    context.setLineDash([4, 3]);
    context.strokeStyle = CURVE_UI_COLORS.selected;
    context.lineWidth = 1;
    context.strokeRect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
    context.setLineDash([]);
    context.fillStyle = CURVE_UI_COLORS.selected;
    const size = CURVE_EDITOR_GRIP_PX;
    for (const { at } of curveEditorGroupGrips(rect)) context.fillRect(at.x - size, at.y - size, size * 2, size * 2);
  }
  if (scene.marquee) curveEditorMarqueeRender(context, scene.marquee);
  context.restore();
}

/**
 * Draws a marquee rectangle.
 *
 * @param context Canvas context.
 * @param marquee Rectangle in pixels.
 */
function curveEditorMarqueeRender(context: CanvasRenderingContext2D, marquee: CurveEditorMarquee): void {
  const { from, to } = marquee;
  context.fillStyle = 'rgba(143, 199, 255, 0.12)';
  context.strokeStyle = CURVE_UI_COLORS.handle;
  context.lineWidth = 1;
  context.fillRect(Math.min(from.x, to.x), Math.min(from.y, to.y), Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  context.strokeRect(Math.min(from.x, to.x), Math.min(from.y, to.y), Math.abs(to.x - from.x), Math.abs(to.y - from.y));
}
