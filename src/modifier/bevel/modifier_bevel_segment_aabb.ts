import type { Box3, Vector3 } from 'three';

/**
 * Returns whether a segment overlaps an axis-aligned box.
 *
 * @param start Segment start in the box's space.
 * @param end Segment end in the box's space.
 * @param bounds Axis-aligned bounds.
 * @returns True when the segment touches the box.
 */
export function modifierBevelSegmentIntersectsAabb(start: Vector3, end: Vector3, bounds: Box3): boolean {
  const x = modifierBevelClipAxis(start.x, end.x, bounds.min.x, bounds.max.x, 0, 1);
  if (!x) return false;
  const y = modifierBevelClipAxis(start.y, end.y, bounds.min.y, bounds.max.y, x.enter, x.exit);
  if (!y) return false;
  const z = modifierBevelClipAxis(start.z, end.z, bounds.min.z, bounds.max.z, y.enter, y.exit);
  return z !== null;
}

/**
 * Clips the segment interval against one axis slab.
 *
 * @param start Start coordinate.
 * @param end End coordinate.
 * @param min Slab minimum.
 * @param max Slab maximum.
 * @param enter Current entry parameter.
 * @param exit Current exit parameter.
 * @returns Updated interval, or null when the slab misses.
 */
function modifierBevelClipAxis(
  start: number,
  end: number,
  min: number,
  max: number,
  enter: number,
  exit: number,
): { enter: number; exit: number } | null {
  const delta = end - start;
  if (Math.abs(delta) < 1e-12) {
    if (start < min || start > max) return null;
    return { enter, exit };
  }
  let near = (min - start) / delta;
  let far = (max - start) / delta;
  if (near > far) {
    const swap = near;
    near = far;
    far = swap;
  }
  const nextEnter = Math.max(enter, near);
  const nextExit = Math.min(exit, far);
  if (nextEnter > nextExit) return null;
  return { enter: nextEnter, exit: nextExit };
}
