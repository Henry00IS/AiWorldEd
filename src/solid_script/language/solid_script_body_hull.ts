import type * as THREE from 'three';
import { solidHullBrushFromPoints } from '@/solid/algorithm/surface/solid_hull_brush.js';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';

/**
 * Builds the convex hull of loose points as a brush. This is the one place a
 * script computes a hull: for corners with no faces of their own, such as a
 * Polyhedron, the Hull block or a brush whose edited faces bent.
 *
 * @param points Points; they are not changed.
 * @returns Brush, or null when the points are flat or too few.
 */
export function solidScriptHullBrush(points: readonly THREE.Vector3[]): SolidBrush | null {
  return solidHullBrushFromPoints(points.map((point) => point.clone()));
}
