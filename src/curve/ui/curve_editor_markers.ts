import type { CurveMarkerSide } from '@/curve/model/curve_markers.js';
import type { Curve, CurveVector } from '@/curve/model/curve_model.js';
import type { CurveEditorView } from './curve_editor_view.js';
import { CURVE_UI_COLORS, CURVE_UI_FONT } from './curve_ui_style.js';

/** Colour of section markers. */
export const CURVE_EDITOR_MARKER_COLOR = '#7ee0c3';

/** Tint of the fixed-height sections outside the markers. */
const CURVE_EDITOR_MARKER_SHADE = 'rgba(126, 224, 195, 0.07)';

/** Pick distance of a marker line in pixels. */
const CURVE_EDITOR_MARKER_PICK_PX = 6;

/** Half size of a marker's grab handle in pixels. */
const CURVE_EDITOR_MARKER_HANDLE_PX = 5;

/** Labels drawn next to each marker. */
const CURVE_EDITOR_MARKER_LABELS: Readonly<Record<CurveMarkerSide, string>> = { bottom: 'base', top: 'top' };

/**
 * Returns the marker whose line lies under a screen point.
 *
 * @param curve Curve.
 * @param view View.
 * @param screen Pointer in pixels.
 * @returns Marker side, or null.
 */
export function curveEditorMarkerHit(curve: Curve, view: CurveEditorView, screen: CurveVector): CurveMarkerSide | null {
  for (const side of ['bottom', 'top'] as const) {
    const x = curve.markers?.[side];
    if (x === undefined) continue;
    const from = view.toScreen({ x, y: 0 });
    const to = view.toScreen({ x, y: 1 });
    if (curveEditorDistanceToSegment(screen, from, to) <= CURVE_EDITOR_MARKER_PICK_PX) return side;
  }
  return null;
}

/**
 * Returns the distance from a point to a line segment.
 *
 * @param point Point.
 * @param from Segment start.
 * @param to Segment end.
 * @returns Distance in pixels.
 */
function curveEditorDistanceToSegment(point: CurveVector, from: CurveVector, to: CurveVector): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = dx * dx + dy * dy;
  const t = length > 0 ? Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / length)) : 0;
  return Math.hypot(point.x - (from.x + dx * t), point.y - (from.y + dy * t));
}

/**
 * Draws the section markers: tinted fixed sections, dashed lines across the
 * unit square, a grab handle and a label.
 *
 * @param context Canvas context.
 * @param view View.
 * @param curve Curve.
 * @param hovered Marker under the pointer, or null.
 */
export function curveEditorMarkersRender(
  context: CanvasRenderingContext2D,
  view: CurveEditorView,
  curve: Curve,
  hovered: CurveMarkerSide | null,
): void {
  const markers = curve.markers;
  if (!markers) return;
  if (markers.bottom !== undefined) curveEditorMarkerShade(context, view, 0, markers.bottom);
  if (markers.top !== undefined) curveEditorMarkerShade(context, view, markers.top, 1);
  for (const side of ['bottom', 'top'] as const) {
    const x = markers[side];
    if (x !== undefined) curveEditorMarkerLine(context, view, x, side, hovered === side);
  }
}

/**
 * Tints the part of the unit square between two x values.
 *
 * @param context Canvas context.
 * @param view View.
 * @param from Start x.
 * @param to End x.
 */
function curveEditorMarkerShade(
  context: CanvasRenderingContext2D,
  view: CurveEditorView,
  from: number,
  to: number,
): void {
  const a = view.toScreen({ x: from, y: 0 });
  const b = view.toScreen({ x: to, y: 1 });
  context.fillStyle = CURVE_EDITOR_MARKER_SHADE;
  context.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
}

/**
 * Strokes a dashed marker line.
 *
 * @param context Canvas context.
 * @param from Start in pixels.
 * @param to End in pixels.
 * @param width Line width.
 */
function curveEditorMarkerDash(
  context: CanvasRenderingContext2D,
  from: CurveVector,
  to: CurveVector,
  width: number,
): void {
  context.save();
  context.setLineDash([5, 4]);
  context.strokeStyle = CURVE_EDITOR_MARKER_COLOR;
  context.lineWidth = width;
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();
  context.restore();
}

/**
 * Draws one marker line with its handle and label.
 *
 * @param context Canvas context.
 * @param view View.
 * @param x Marker x.
 * @param side Marker side.
 * @param hovered True when under the pointer.
 */
function curveEditorMarkerLine(
  context: CanvasRenderingContext2D,
  view: CurveEditorView,
  x: number,
  side: CurveMarkerSide,
  hovered: boolean,
): void {
  const to = view.toScreen({ x, y: 1 });
  curveEditorMarkerDash(context, view.toScreen({ x, y: 0 }), to, hovered ? 2 : 1.25);
  const size = hovered ? CURVE_EDITOR_MARKER_HANDLE_PX + 1 : CURVE_EDITOR_MARKER_HANDLE_PX;
  context.fillStyle = CURVE_EDITOR_MARKER_COLOR;
  context.fillRect(to.x - size, to.y - size, size * 2, size * 2);
  context.font = CURVE_UI_FONT;
  context.fillStyle = CURVE_UI_COLORS.text;
  context.textBaseline = 'bottom';
  context.fillText(CURVE_EDITOR_MARKER_LABELS[side], to.x + size + 3, to.y + size);
}
