import { curveHandlePosition, type Curve, type CurveVector } from '@/curve/model/curve_model.js';
import { curveSegmentSample } from '@/curve/model/curve_sample.js';
import type { CurveEditorView } from './curve_editor_view.js';

/** A selected point or segment of the curve. */
export type CurveEditorSelection = { kind: 'point' | 'segment'; index: number } | null;

/** One visible handle: its point and side. */
export interface CurveEditorHandleRef {
  /** Point index. */
  index: number;
  /** Handle side. */
  side: 'in' | 'out';
}

/** What lies under the pointer. */
export type CurveEditorHit =
  { kind: 'point' | 'segment'; index: number } | ({ kind: 'handle' } & CurveEditorHandleRef) | null;

/** Pick radius of points and handles in pixels. */
export const CURVE_EDITOR_PICK_PX = 7;

/**
 * Returns the handles shown for a selection: the handles of bent segments that
 * touch the selected point or segment.
 *
 * @param curve Curve.
 * @param selection Selection.
 * @returns Visible handles.
 */
export function curveEditorVisibleHandles(curve: Curve, selection: CurveEditorSelection): CurveEditorHandleRef[] {
  if (!selection) return [];
  const segments =
    selection.kind === 'segment' ? [selection.index] : [selection.index - 1, selection.index].filter((at) => at >= 0);
  return segments.flatMap((segment) => {
    const mode = curve.segments[segment]?.mode;
    if (mode === 'quadratic') return [{ index: segment, side: 'out' as const }];
    if (mode === 'bezier')
      return [
        { index: segment, side: 'out' as const },
        { index: segment + 1, side: 'in' as const },
      ];
    return [];
  });
}

/**
 * Returns the curve part under a screen point: handles first, then points, then
 * segments.
 *
 * @param curve Curve.
 * @param view View.
 * @param selection Current selection, which decides the visible handles.
 * @param screen Pointer in pixels.
 * @returns Hit, or null.
 */
export function curveEditorHitTest(
  curve: Curve,
  view: CurveEditorView,
  selection: CurveEditorSelection,
  screen: CurveVector,
): CurveEditorHit {
  const near = (point: CurveVector) => Math.hypot(point.x - screen.x, point.y - screen.y) <= CURVE_EDITOR_PICK_PX;
  for (const handle of curveEditorVisibleHandles(curve, selection)) {
    const point = curve.points[handle.index];
    if (point && near(view.toScreen(curveHandlePosition(point, handle.side)))) return { kind: 'handle', ...handle };
  }
  const pointIndex = curve.points.findIndex((point) => near(view.toScreen(point)));
  if (pointIndex >= 0) return { kind: 'point', index: pointIndex };
  const segment = curve.segments.findIndex((_, index) => curveEditorSegmentNear(curve, view, index, screen));
  return segment >= 0 ? { kind: 'segment', index: segment } : null;
}

/**
 * Returns whether a screen point lies close to a segment.
 *
 * @param curve Curve.
 * @param view View.
 * @param index Segment index.
 * @param screen Pointer in pixels.
 * @returns True within the pick radius.
 */
function curveEditorSegmentNear(curve: Curve, view: CurveEditorView, index: number, screen: CurveVector): boolean {
  const start = curve.points[index];
  if (!start) return false;
  const points = [start, ...curveSegmentSample(curve, index)].map((point) => view.toScreen(point));
  return points.slice(1).some((point, at) => curveEditorDistanceToLine(screen, points[at] ?? point, point) <= 5);
}

/**
 * Returns the distance from a point to a line segment.
 *
 * @param point Point.
 * @param start Segment start.
 * @param end Segment end.
 * @returns Distance in the same units.
 */
export function curveEditorDistanceToLine(point: CurveVector, start: CurveVector, end: CurveVector): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = dx * dx + dy * dy;
  const t = length > 0 ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / length)) : 0;
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
}
