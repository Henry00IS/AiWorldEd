import type * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import { solidHullBrushFromPoints } from '@/solid/algorithm/surface/solid_hull_brush.js';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';

/** Grid the face order key rounds positions to, in metres. */
const MODIFIER_STACK_HULL_KEY_GRID = 1e5;

/**
 * Builds the convex hull of points as a piece, or nothing when it encloses no
 * valid volume. Faces come in a fixed order, so the same shape always gets the
 * same faces however the box was rounded.
 *
 * @param points Corner points in frame coordinates.
 * @returns Zero or one brush.
 */
export function modifierStackPrimitiveHullPieces(points: readonly THREE.Vector3[]): SolidBrush[] {
  const hull = solidHullBrushFromPoints(points);
  const brush = hull ? SolidBrushFactory.createFromFaceLoops(modifierStackHullLoops(hull)) : null;
  return brush && SolidBrushValidator.validateGenerated(brush).valid ? [brush] : [];
}

/**
 * Returns the face loops of a brush in a fixed order: each loop starts at the
 * corner with the smallest key and the loops are sorted by their corner keys.
 *
 * @param brush Brush.
 * @returns Face loops.
 */
function modifierStackHullLoops(brush: SolidBrush): THREE.Vector3[][] {
  const loops = brush.faces.map((face) => {
    const loop = brush.getFaceVertexIndices(face).flatMap((index) => brush.vertices[index]?.clone() ?? []);
    const keys = loop.map(modifierStackHullKey);
    const first = keys.indexOf([...keys].sort()[0] ?? '');
    return [...loop.slice(first), ...loop.slice(0, first)];
  });
  const keyed = loops.map((loop) => ({ loop, key: loop.map(modifierStackHullKey).join('|') }));
  return keyed.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)).map((entry) => entry.loop);
}

/**
 * Returns a sortable key of a position rounded to a fine grid.
 *
 * @param point Position.
 * @returns Key.
 */
function modifierStackHullKey(point: THREE.Vector3): string {
  return point
    .toArray()
    .map((value) => String(Math.round(value * MODIFIER_STACK_HULL_KEY_GRID) + 0))
    .join(',');
}

/**
 * Returns the eight corners of a box.
 *
 * @param box Box.
 * @returns Corners.
 */
export function modifierStackPrimitiveBoxCorners(box: THREE.Box3): THREE.Vector3[] {
  const corners: THREE.Vector3[] = [];
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z]) corners.push(box.min.clone().set(x, y, z));
  return corners;
}
