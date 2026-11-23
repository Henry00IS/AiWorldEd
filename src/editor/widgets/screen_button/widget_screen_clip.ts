import { Vector3, Vector4 } from 'three';
import type { EditorViewportPickContext } from '@/editor/window/editor_viewport_pick_context.js';

/** A line on screen in client coordinates. */
export interface WidgetScreenSegment {
  /** Client X of the start. */
  x0: number;
  /** Client Y of the start. */
  y0: number;
  /** Client X of the end. */
  x1: number;
  /** Client Y of the end. */
  y1: number;
}

/**
 * Projects the part of a scene line that is in a pane's view: the line is cut
 * where it leaves the view, so it shows whenever any of it is in view, even
 * when both ends are outside or behind the camera.
 *
 * @param from World start.
 * @param to World end.
 * @param pane Pane camera and pick surface.
 * @returns Client segment, or null when no part is in view.
 */
export function widgetScreenClip(
  from: Vector3,
  to: Vector3,
  pane: EditorViewportPickContext,
): WidgetScreenSegment | null {
  const start = widgetScreenClipSpace(from, pane);
  const end = widgetScreenClipSpace(to, pane);
  const range = widgetScreenClipRange(start, end);
  if (!range) return null;
  const rect = pane.pickElement.getBoundingClientRect();
  const client = (part: number): [number, number] => {
    const at = start.clone().lerp(end, part);
    return [rect.left + ((at.x / at.w + 1) / 2) * rect.width, rect.top + ((1 - at.y / at.w) / 2) * rect.height];
  };
  const [x0, y0] = client(range[0]);
  const [x1, y1] = client(range[1]);
  return { x0, y0, x1, y1 };
}

/**
 * Returns a world point in the clip space of a pane's camera.
 *
 * @param point World point.
 * @param pane Pane camera.
 * @returns Homogeneous clip point.
 */
function widgetScreenClipSpace(point: Vector3, pane: EditorViewportPickContext): Vector4 {
  const camera = pane.camera;
  return new Vector4(point.x, point.y, point.z, 1)
    .applyMatrix4(camera.matrixWorldInverse)
    .applyMatrix4(camera.projectionMatrix);
}

/**
 * Returns the part of a clip-space line inside the view volume, as fractions
 * from start to end, cutting it at each of the six sides.
 *
 * @param start Clip start.
 * @param end Clip end.
 * @returns First and last fraction inside, or null when none is.
 */
function widgetScreenClipRange(start: Vector4, end: Vector4): [number, number] | null {
  let range: [number, number] = [0, 1];
  for (const axis of ['x', 'y', 'z'] as const) {
    for (const sign of [1, -1]) {
      const inside0 = start.w + sign * start[axis];
      const inside1 = end.w + sign * end[axis];
      const cut = widgetScreenClipCut(range, inside0, inside1);
      if (!cut) return null;
      range = cut;
    }
  }
  return range;
}

/**
 * Cuts a part of a line at one side of the view: a side value of 0 or more is
 * inside.
 *
 * @param range Fractions kept so far.
 * @param inside0 Side value at the start.
 * @param inside1 Side value at the end.
 * @returns Fractions kept, or null when the part is wholly outside.
 */
function widgetScreenClipCut(range: [number, number], inside0: number, inside1: number): [number, number] | null {
  if (inside0 < 0 && inside1 < 0) return null;
  const at = inside0 / (inside0 - inside1);
  const kept: [number, number] = [
    inside0 < 0 ? Math.max(range[0], at) : range[0],
    inside1 < 0 ? Math.min(range[1], at) : range[1],
  ];
  return kept[0] <= kept[1] ? kept : null;
}
