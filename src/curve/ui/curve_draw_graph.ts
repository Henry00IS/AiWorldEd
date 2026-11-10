import type { Curve } from '@/curve/model/curve_model.js';
import { curveLayerView, curveUsesCustomSide } from '@/curve/model/curve_side.js';
import { curveEditorRender, type CurveEditorScene } from './curve_editor_render.js';
import { CurveEditorView } from './curve_editor_view.js';

/**
 * Largest margin around the unit square of a graph preview, the editor's own,
 * in CSS pixels.
 */
const CURVE_DRAW_GRAPH_MARGIN_MAX_PX = 28;

/**
 * Smallest margin around the unit square of a graph preview, room for the value
 * labels, in CSS pixels.
 */
const CURVE_DRAW_GRAPH_MARGIN_MIN_PX = 18;

/**
 * Smallest half size of preview points, still visible on chat cards, in CSS
 * pixels.
 */
const CURVE_DRAW_GRAPH_POINT_MIN_PX = 2.5;

/** Largest half size of preview points, the editor's own, in CSS pixels. */
const CURVE_DRAW_GRAPH_POINT_MAX_PX = 4;

/**
 * CSS pixels drawn per image pixel in shared PNG previews: drawn at half size,
 * then doubled.
 */
const CURVE_DRAW_GRAPH_PNG_SCALE = 2;

/**
 * Draws a curve the way the curve editor shows it with nothing selected: grid
 * and value labels, Base and Top markers with their fixed sections, section
 * bands, the curve, its points (smaller on small drawings), and the secondary
 * line faded behind it when a segment uses it.
 *
 * @param canvas Target canvas, already sized in device pixels.
 * @param curve Curve.
 * @param width Drawing width in CSS pixels; the canvas width over it is the
 *   pixel ratio.
 * @param height Drawing height in CSS pixels.
 */
export function curveDrawGraph(canvas: HTMLCanvasElement, curve: Curve, width: number, height: number): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  const ratio = canvas.width / Math.max(1, width);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  const view = new CurveEditorView(curveDrawGraphMargin(width, height));
  view.resize(width, height);
  view.frameAll();
  curveEditorRender(context, view, { ...curveDrawGraphScene(curve), pointSize: curveDrawGraphPointSize(height) });
}

/**
 * Returns the half size of the points of a graph preview: the editor's on large
 * drawings, smaller on chat cards so busy curves stay readable.
 *
 * @param height Drawing height in CSS pixels.
 * @returns Half size in CSS pixels.
 */
function curveDrawGraphPointSize(height: number): number {
  return Math.min(CURVE_DRAW_GRAPH_POINT_MAX_PX, Math.max(CURVE_DRAW_GRAPH_POINT_MIN_PX, height / 40));
}

/**
 * Returns the margin of a graph preview: the editor's on large drawings, less
 * on small ones so the curve keeps most of the space.
 *
 * @param width Drawing width in CSS pixels.
 * @param height Drawing height in CSS pixels.
 * @returns Margin in CSS pixels.
 */
function curveDrawGraphMargin(width: number, height: number): number {
  const share = Math.round(Math.min(width, height) * 0.09);
  return Math.min(CURVE_DRAW_GRAPH_MARGIN_MAX_PX, Math.max(CURVE_DRAW_GRAPH_MARGIN_MIN_PX, share));
}

/**
 * Builds the editor scene of a preview: the main line, nothing selected or
 * hovered, the decade grid, and the secondary line as the faded other line.
 *
 * @param curve Curve.
 * @returns Scene.
 */
function curveDrawGraphScene(curve: Curve): CurveEditorScene {
  const other = curve.secondary && curveUsesCustomSide(curve) ? curveLayerView(curve, 'secondary') : null;
  return { curve, selection: null, hover: null, snapStep: 0, points: [], marquee: null, layer: 'primary', other };
}

/**
 * Draws a curve as the editor shows it into a new canvas and encodes it as a
 * PNG without holding up the editor: the graph is drawn at half the image size
 * and doubled, so lines, points and labels stay legible where the image is
 * shown smaller, and `toBlob` encodes asynchronously.
 *
 * @param curve Curve.
 * @param width Image width in pixels.
 * @param height Image height in pixels.
 * @param documentRef Document that creates the canvas.
 * @returns PNG, or null when canvas drawing is unavailable.
 */
export function curveDrawGraphPng(
  curve: Curve,
  width: number,
  height: number,
  documentRef: Document = document,
): Promise<Blob | null> {
  const canvas = documentRef.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  if (!canvas.getContext('2d')) return Promise.resolve(null);
  curveDrawGraph(canvas, curve, width / CURVE_DRAW_GRAPH_PNG_SCALE, height / CURVE_DRAW_GRAPH_PNG_SCALE);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
