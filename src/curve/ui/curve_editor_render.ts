import { curveHandlePosition, type Curve } from '@/curve/model/curve_model.js';
import { curveSegmentSample } from '@/curve/model/curve_sample.js';
import { CURVE_DRAW_PRIMARY, CURVE_DRAW_SECONDARY, curveDrawLine, curveDrawLineFaded } from './curve_draw.js';
import type { CurveLayerKind } from '@/curve/model/curve_side.js';
import { curveEditorVisibleHandles, type CurveEditorHit, type CurveEditorSelection } from './curve_editor_hit.js';
import type { CurveEditorView } from './curve_editor_view.js';
import { curveEditorMarkersRender } from './curve_editor_markers.js';
import { curveEditorGroupRender, type CurveEditorMarquee } from './curve_editor_group.js';
import { CURVE_UI_COLORS } from './curve_ui_style.js';
import { curveEditorGridRender, curveEditorStrokeLine } from './curve_editor_grid.js';

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
  /** Selected point indices. */
  points: readonly number[];
  /** Marquee being dragged, or null. */
  marquee: CurveEditorMarquee | null;
  /** Line being edited. */
  layer: CurveLayerKind;
  /** The other line, drawn faded and not pickable; null without one. */
  other: Curve | null;
  /**
   * Half size of the curve points in pixels, before hover or selection grows
   * them; the editor's own size when left out. Small previews pass less.
   */
  pointSize?: number;
}

/** Half size of the curve points in the editor, in pixels. */
const CURVE_EDITOR_POINT_SIZE_PX = 4;

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
  curveEditorGridRender(context, view, scene.snapStep);
  curveEditorMarkersRender(context, view, scene.curve, scene.hover?.kind === 'marker' ? scene.hover.side : null);
  curveEditorRenderLines(context, view, scene);
  curveEditorRenderSelectedSegment(context, view, scene);
  curveEditorRenderHandles(context, view, scene);
  curveEditorRenderPoints(context, view, scene);
  curveEditorGroupRender(context, view, scene);
}

/**
 * Draws the faded other line, then the edited line on top: orange for the main
 * line, teal for the secondary one.
 *
 * @param context Canvas context.
 * @param view View.
 * @param scene Editor scene.
 */
function curveEditorRenderLines(
  context: CanvasRenderingContext2D,
  view: CurveEditorView,
  scene: CurveEditorScene,
): void {
  const map = (point: { x: number; y: number }) => view.toScreen(point);
  const secondary = scene.layer === 'secondary';
  if (scene.other)
    curveDrawLineFaded(context, scene.other, map, 2, secondary ? CURVE_DRAW_PRIMARY : CURVE_DRAW_SECONDARY);
  curveDrawLine(context, scene.curve, map, 2, secondary ? CURVE_DRAW_SECONDARY : CURVE_DRAW_PRIMARY);
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
    const selected = scene.points.includes(index);
    const hovered = scene.hover?.kind === 'point' && scene.hover.index === index;
    const base = scene.pointSize ?? CURVE_EDITOR_POINT_SIZE_PX;
    const size = hovered || selected ? base + 1 : base;
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
