import type { Curve, CurveVector } from '@/curve/model/curve_model.js';
import { curveSample } from '@/curve/model/curve_sample.js';
import { curveLayerView, curveUsesCustomSide } from '@/curve/model/curve_side.js';
import { CURVE_UI_COLORS, CURVE_UI_INACTIVE_ALPHA } from './curve_ui_style.js';
import { curveDrawSectionBands } from './curve_draw_bands.js';

/** Line and fill colours of one drawn profile line. */
export interface CurveDrawColors {
  /** Line colour. */
  line: string;
  /** Fill colour under the line. */
  fill: string;
}

/** Colours of the main line. */
export const CURVE_DRAW_PRIMARY: CurveDrawColors = { line: CURVE_UI_COLORS.line, fill: CURVE_UI_COLORS.fill };

/** Colours of the secondary line. */
export const CURVE_DRAW_SECONDARY: CurveDrawColors = {
  line: CURVE_UI_COLORS.secondaryLine,
  fill: CURVE_UI_COLORS.secondaryFill,
};

/** Turns a curve-space point into canvas pixels. */
export type CurveDrawMap = (point: CurveVector) => CurveVector;

/** Side length of project browser curve thumbnails in pixels. */
export const CURVE_DRAW_THUMBNAIL_PX = 96;

/**
 * Draws a curve as a line with a soft fill down to y 0: orange for the main
 * line unless other colours are given.
 *
 * @param context Canvas context.
 * @param curve Curve.
 * @param map Curve to pixel mapping.
 * @param width Line width in pixels.
 * @param colors Line and fill colours.
 */
export function curveDrawLine(
  context: CanvasRenderingContext2D,
  curve: Curve,
  map: CurveDrawMap,
  width: number,
  colors: CurveDrawColors = CURVE_DRAW_PRIMARY,
): void {
  const points = curveSample(curve).map(map);
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return;
  const baseFirst = map({ x: 0, y: 0 });
  const baseLast = map({ x: 1, y: 0 });
  context.beginPath();
  context.moveTo(baseFirst.x, baseFirst.y);
  for (const point of points) context.lineTo(point.x, point.y);
  context.lineTo(baseLast.x, baseLast.y);
  context.closePath();
  context.fillStyle = colors.fill;
  context.fill();
  curveDrawSectionBands(context, curve, map, width);
  context.beginPath();
  points.forEach((point, index) => (index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y)));
  context.strokeStyle = colors.line;
  context.lineWidth = width;
  context.lineJoin = 'round';
  context.stroke();
}

/**
 * Draws the line that is not being edited, faded behind the active one.
 *
 * @param context Canvas context.
 * @param curve Curve of that line.
 * @param map Curve to pixel mapping.
 * @param width Line width in pixels.
 * @param colors Line and fill colours.
 */
export function curveDrawLineFaded(
  context: CanvasRenderingContext2D,
  curve: Curve,
  map: CurveDrawMap,
  width: number,
  colors: CurveDrawColors,
): void {
  context.save();
  context.globalAlpha = CURVE_UI_INACTIVE_ALPHA;
  curveDrawLine(context, curve, map, width, colors);
  context.restore();
}

/**
 * Draws a curve filling a canvas with a small margin, as the inspector strip
 * and thumbnails show it, with the secondary line behind it when a segment uses
 * it.
 *
 * @param canvas Target canvas, already sized.
 * @param curve Curve.
 * @param rotated True draws x upward (0 at the bottom) and y to the right.
 */
export function curveDrawPreview(canvas: HTMLCanvasElement, curve: Curve, rotated = false): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  const margin = Math.max(2, Math.round(Math.min(canvas.width, canvas.height) * 0.08));
  const width = canvas.width - margin * 2;
  const height = canvas.height - margin * 2;
  context.fillStyle = CURVE_UI_COLORS.background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = CURVE_UI_COLORS.gridMajor;
  context.lineWidth = 1;
  context.strokeRect(margin + 0.5, margin + 0.5, width - 1, height - 1);
  const map: CurveDrawMap = rotated
    ? (point) => ({ x: margin + point.y * width, y: margin + (1 - point.x) * height })
    : (point) => ({ x: margin + point.x * width, y: margin + (1 - point.y) * height });
  const lineWidth = Math.max(1.5, canvas.height / 40);
  if (curveUsesCustomSide(curve) && curve.secondary)
    curveDrawLine(context, curveLayerView(curve, 'secondary'), map, lineWidth, CURVE_DRAW_SECONDARY);
  curveDrawLine(context, curve, map, lineWidth);
}

/**
 * Draws a square thumbnail of a curve.
 *
 * @param curve Curve.
 * @param documentRef Document that creates the canvas.
 * @returns PNG data URL, or null when canvas drawing is unavailable.
 */
export function curveDrawThumbnail(curve: Curve, documentRef: Document = document): string | null {
  const canvas = documentRef.createElement('canvas');
  canvas.width = CURVE_DRAW_THUMBNAIL_PX;
  canvas.height = CURVE_DRAW_THUMBNAIL_PX;
  if (!canvas.getContext('2d')) return null;
  curveDrawPreview(canvas, curve);
  return canvas.toDataURL('image/png');
}
