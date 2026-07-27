import * as THREE from 'three';
import { BoundsFace } from '../../types/bounds_face.js';
import { getBoundsFaceLocalNormal, type OrientedBoundsData } from './oriented_bounds.js';
import { getHiddenBoundsAxesForViewPlane, type CadViewPlane } from '../../rulers/cad_view_plane.js';

/**
 * CSS cursor when hovering the bounds body for move. Regular pointer — not the
 * four-way drag (`move`) cursor.
 */
export const BOUNDS_MOVE_CURSOR = 'default';

/** Default viewport cursor when not over a bounds control. */
export const BOUNDS_DEFAULT_CURSOR = 'default';

/**
 * Resolves a CSS resize cursor for a bounds face so the pointer arrows match
 * the pull direction. Uses standard browser cursors (`ew-resize`, `ns-resize`,
 * `nwse-resize`, `nesw-resize`).
 *
 * Perspective and orthographic both project the face normal into screen space
 * so rotated OBBs get diagonal cursors in 2D. Depth-axis faces in ortho panes
 * stay default (not resizable there).
 *
 * @param face Face whose mid-grip is hovered.
 * @param bounds Current oriented bounds (for world normal).
 * @param camera Active viewport camera.
 * @param viewPlane Optional view plane for depth-axis filtering in 2D.
 * @returns CSS cursor keyword.
 */
export function resolveBoundsResizeCursor(
  face: BoundsFace,
  bounds: OrientedBoundsData,
  camera: THREE.Camera,
  viewPlane: CadViewPlane = 'xyz',
): string {
  if (viewPlane !== 'xyz') {
    const hidden = getHiddenBoundsAxesForViewPlane(viewPlane);
    if (hidden.includes(faceAxisLetter(face))) {
      return BOUNDS_DEFAULT_CURSOR;
    }
  }
  return resolveScreenProjectedResizeCursor(face, bounds, camera);
}

/**
 * Chooses a resize cursor from the face normal projected into screen space.
 * Shared by perspective and orthographic cameras so rotated bounds in 2D get
 * diagonal cursors when the pull direction is diagonal on screen.
 *
 * @param face Bounds face under the pointer.
 * @param bounds Oriented bounds for the world normal.
 * @param camera Active viewport camera.
 * @returns CSS cursor keyword.
 */
function resolveScreenProjectedResizeCursor(
  face: BoundsFace,
  bounds: OrientedBoundsData,
  camera: THREE.Camera,
): string {
  camera.updateMatrixWorld(true);
  const worldNormal = getBoundsFaceLocalNormal(face).applyQuaternion(bounds.quaternion).normalize();
  const origin = bounds.center.clone();
  const tip = origin.clone().add(worldNormal);
  const screenOrigin = origin.project(camera);
  const screenTip = tip.project(camera);
  const deltaX = screenTip.x - screenOrigin.x;
  const deltaYCss = -(screenTip.y - screenOrigin.y);
  return cursorFromScreenDelta(deltaX, deltaYCss);
}

/**
 * Picks among the four dual-arrow CSS resize cursors from a screen delta.
 *
 * @param deltaX Screen-space X component of the pull direction.
 * @param deltaY Screen-space Y component with CSS orientation (down positive).
 * @returns CSS cursor keyword.
 */
export function cursorFromScreenDelta(deltaX: number, deltaY: number): string {
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);
  if (absX < 1e-8 && absY < 1e-8) return BOUNDS_DEFAULT_CURSOR;
  if (absX > absY * 2) return 'ew-resize';
  if (absY > absX * 2) return 'ns-resize';
  const sameSignInCssSpace = deltaX * deltaY >= 0;
  if (sameSignInCssSpace) return 'nwse-resize';
  return 'nesw-resize';
}

/**
 * Returns the axis letter for a bounds face.
 *
 * @param face Bounds face.
 * @returns Axis letter.
 */
function faceAxisLetter(face: BoundsFace): 'x' | 'y' | 'z' {
  if (face === BoundsFace.POS_X || face === BoundsFace.NEG_X) return 'x';
  if (face === BoundsFace.POS_Y || face === BoundsFace.NEG_Y) return 'y';
  return 'z';
}
