import * as THREE from 'three';
import { PAINT_DAB_STRIDE, type PaintStroke, paintStrokeDabCount } from './paint_stroke.js';

const paintStrokeBoundsCache = new WeakMap<PaintStroke, THREE.Box3>();

/**
 * Returns the brush-local box every dab of a stroke can reach. Strokes are
 * immutable, so the box is cached per record.
 *
 * @param stroke Stroke.
 * @returns Bounds (do not modify).
 */
export function paintStrokeBounds(stroke: PaintStroke): THREE.Box3 {
  const cached = paintStrokeBoundsCache.get(stroke);
  if (cached !== undefined) return cached;
  const bounds = new THREE.Box3();
  const point = new THREE.Vector3();
  const count = paintStrokeDabCount(stroke);
  for (let dab = 0; dab < count; dab++) {
    point.fromArray(stroke.dabs, dab * PAINT_DAB_STRIDE);
    bounds.expandByPoint(point);
  }
  // A dab reaches one radius into the plane and radius / facing sideways.
  if (!bounds.isEmpty()) bounds.expandByScalar(stroke.radius / 0.3);
  paintStrokeBoundsCache.set(stroke, bounds);
  return bounds;
}
