import { Viewport2D } from '@/viewports/core/viewport_2d.js';
import { Viewport3D } from '@/viewports/core/viewport_3d.js';
import type { ViewportEditor } from '@/viewports/core/viewport_editor.js';
import { isPerspectiveViewport } from '@/viewports/core/viewport_editor.js';
import { ViewportKind } from '@/viewports/core/viewport_kind.js';

/** Named top, front, side, and perspective viewport field bag. */
export interface NamedViewportFields {
  viewport2DTop: Viewport2D | null;
  viewport2DFront: Viewport2D | null;
  viewport2DSide: Viewport2D | null;
  /** Perspective viewport when one exists in the bag, otherwise null. */
  viewport3D: Viewport3D | null;
}

/**
 * Builds named top, front, side, and perspective fields from a viewport list.
 * Each orthographic role uses the matching kind when it is a Viewport2D,
 * otherwise the first Viewport2D in the list. The perspective role is the first
 * Viewport3D in the list when present, otherwise null.
 *
 * @param all Viewports to scan for named roles.
 * @returns Named field bag for top, front, side, and perspective roles.
 */
export function resolveNamedViewportFields(all: readonly ViewportEditor[]): NamedViewportFields {
  const top = all.find((viewport) => viewport.getViewportKind() === ViewportKind.TOP);
  const front = all.find((viewport) => viewport.getViewportKind() === ViewportKind.FRONT);
  const side = all.find((viewport) => viewport.getViewportKind() === ViewportKind.SIDE);
  const perspective = all.find((viewport) => isPerspectiveViewport(viewport));
  const first2d = all.find((viewport) => viewport instanceof Viewport2D) ?? null;
  const first3d = all.find((viewport) => viewport instanceof Viewport3D) ?? null;
  return {
    viewport2DTop: top instanceof Viewport2D ? top : first2d,
    viewport2DFront: front instanceof Viewport2D ? front : first2d,
    viewport2DSide: side instanceof Viewport2D ? side : first2d,
    viewport3D: perspective instanceof Viewport3D ? perspective : first3d,
  };
}

/**
 * Returns the first perspective viewport in the list, or null when none exist.
 *
 * @param viewports Viewports to scan for a perspective instance.
 * @returns First Viewport3D match, or null when the list has none.
 */
export function findPrimaryPerspectiveViewport(viewports: readonly ViewportEditor[]): Viewport3D | null {
  const found = viewports.find((viewport) => isPerspectiveViewport(viewport));
  return found ?? null;
}
