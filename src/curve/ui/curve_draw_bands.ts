import type { Curve, CurveSegment } from '@/curve/model/curve_model.js';
import { curveSegmentSample } from '@/curve/model/curve_sample.js';
import { curveSegmentBlendEnds } from '@/curve/model/curve_blend.js';
import { CURVE_UI_COLORS } from './curve_ui_style.js';
import type { CurveDrawMap } from './curve_draw.js';

/** Colour accents for the non-round section graph bands. */
const CURVE_SECTION_COLORS = {
  square: CURVE_UI_COLORS.square,
  polygon: '#dbbd52',
  cross: '#e0874f',
  bar: '#d46a8c',
  stadium: '#6fa8e8',
};

/** Colour accent for square and polygon bands with cut or rounded corners. */
const CURVE_SECTION_CORNER_COLOR = '#42bfa8';

/** Colour accent for rotated round segments. */
const CURVE_SECTION_ROTATED_COLOR = '#d5a2ff';

/**
 * Draws distinct section bands with dashed accents for accumulated twist;
 * rotated round segments get a band too. A segment that blends fades from its
 * neighbour's colour into its own, so the morph shows on the graph.
 *
 * @param context Canvas context.
 * @param curve Curve.
 * @param map Curve to pixel mapping.
 * @param width Curve line width in pixels.
 */
export function curveDrawSectionBands(
  context: CanvasRenderingContext2D,
  curve: Curve,
  map: CurveDrawMap,
  width: number,
): void {
  context.save();
  context.lineWidth = width * 4;
  context.lineCap = 'butt';
  curve.segments.forEach((segment, index) => {
    const start = curve.points[index];
    const ends = curveSegmentBlendEnds(curve, index);
    const own = curveDrawBandColor(segment);
    const lower = ends.start ? curveDrawBandColor(curve.segments[index - 1]) : own;
    const upper = ends.end ? curveDrawBandColor(curve.segments[index + 1]) : own;
    if (!start || (!lower && !upper)) return;
    const points = [start, ...curveSegmentSample(curve, index)].map(map);
    context.strokeStyle = curveDrawBandStroke(context, points, lower, upper);
    context.setLineDash(segment.twist ? [6, 3] : []);
    context.beginPath();
    points.forEach((point, at) => (at === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y)));
    context.stroke();
  });
  context.restore();
}

/**
 * Returns the band colour of a segment.
 *
 * @param segment Segment, or undefined.
 * @returns Colour, or null for plain round segments, which have no band.
 */
function curveDrawBandColor(segment: CurveSegment | undefined): string | null {
  if (!segment || (!segment.section && !segment.twist && !segment.rotation)) return null;
  if (segment.cornerSize) return CURVE_SECTION_CORNER_COLOR;
  return segment.section ? CURVE_SECTION_COLORS[segment.section] : CURVE_SECTION_ROTATED_COLOR;
}

/**
 * Returns a solid colour, or a gradient along the band from its lower to its
 * upper colour; a missing colour fades the other one out.
 *
 * @param context Canvas context.
 * @param points Band points in pixels, bottom to top of the profile.
 * @param lower Colour at the first point.
 * @param upper Colour at the last point.
 * @returns Stroke style.
 */
function curveDrawBandStroke(
  context: CanvasRenderingContext2D,
  points: readonly { x: number; y: number }[],
  lower: string | null,
  upper: string | null,
): string | CanvasGradient {
  if (lower === upper && lower) return lower;
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return lower ?? upper ?? CURVE_UI_COLORS.square;
  const gradient = context.createLinearGradient(first.x, first.y, last.x, last.y);
  gradient.addColorStop(0, lower ?? curveDrawTransparent(upper ?? ''));
  gradient.addColorStop(1, upper ?? curveDrawTransparent(lower ?? ''));
  return gradient;
}

/**
 * Returns a fully transparent version of a colour, so a gradient into it fades
 * without darkening.
 *
 * @param color Colour as #rrggbb or rgb()/rgba().
 * @returns Transparent rgba colour.
 */
function curveDrawTransparent(color: string): string {
  const channels = color.match(/\d+(\.\d+)?/g);
  if (color.startsWith('rgb') && channels && channels.length >= 3)
    return `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, 0)`;
  const value = Number.parseInt(color.replace('#', '').slice(0, 6), 16) || 0;
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, 0)`;
}
