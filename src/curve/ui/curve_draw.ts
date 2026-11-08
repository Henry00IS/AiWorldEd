import type { Curve, CurveVector } from '@/curve/model/curve_model.js';
import { curveSample, curveSegmentSample } from '@/curve/model/curve_sample.js';
import { CURVE_UI_COLORS } from './curve_ui_style.js';

/** Turns a curve-space point into canvas pixels. */
export type CurveDrawMap = (point: CurveVector) => CurveVector;

/** Side length of project browser curve thumbnails in pixels. */
export const CURVE_DRAW_THUMBNAIL_PX = 96;

/**
 * Draws a curve as an orange line with a soft fill down to y 0.
 *
 * @param context Canvas context.
 * @param curve Curve.
 * @param map Curve to pixel mapping.
 * @param width Line width in pixels.
 */
export function curveDrawLine(context: CanvasRenderingContext2D, curve: Curve, map: CurveDrawMap, width: number): void {
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
  context.fillStyle = CURVE_UI_COLORS.fill;
  context.fill();
  curveDrawSectionBands(context, curve, map, width);
  context.beginPath();
  points.forEach((point, index) => (index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y)));
  context.strokeStyle = CURVE_UI_COLORS.line;
  context.lineWidth = width;
  context.lineJoin = 'round';
  context.stroke();
}

/** Colour accents for the non-round section graph bands. */
const CURVE_SECTION_COLORS = {
  square: CURVE_UI_COLORS.square,
  polygon: '#dbbd52',
};

/** Colour accent for square and polygon bands with cut or rounded corners. */
const CURVE_SECTION_CORNER_COLOR = '#42bfa8';

/**
 * Draws distinct section bands with dashed accents for accumulated twist;
 * rotated round segments get a band too.
 *
 * @param context Canvas context.
 * @param curve Curve.
 * @param map Curve to pixel mapping.
 * @param width Curve line width in pixels.
 */
function curveDrawSectionBands(
  context: CanvasRenderingContext2D,
  curve: Curve,
  map: CurveDrawMap,
  width: number,
): void {
  context.save();
  context.strokeStyle = CURVE_UI_COLORS.square;
  context.lineWidth = width * 4;
  context.lineCap = 'butt';
  curve.segments.forEach((segment, index) => {
    const start = curve.points[index];
    if ((!segment.section && !segment.twist && !segment.rotation) || !start) return;

    context.strokeStyle = segment.cornerSize
      ? CURVE_SECTION_CORNER_COLOR
      : segment.section
        ? CURVE_SECTION_COLORS[segment.section]
        : '#d5a2ff';
    context.setLineDash(segment.twist ? [6, 3] : []);
    const points = [start, ...curveSegmentSample(curve, index)].map(map);
    context.beginPath();
    points.forEach((point, at) => (at === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y)));
    context.stroke();
  });
  context.restore();
}

/**
 * Draws a curve filling a canvas with a small margin, as the inspector strip
 * and thumbnails show it.
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
  curveDrawLine(context, curve, map, Math.max(1.5, canvas.height / 40));
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
