import { Vector3 } from 'three';
import { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidDualHull } from '@/solid/algorithm/surface/solid_dual_hull.js';
import { solidHullLoops } from '@/solid/algorithm/surface/solid_hull_loops.js';

/**
 * Builds a convex brush that encloses a point set.
 *
 * @param source Points to enclose.
 * @returns Brush, or null when the points are flat or the hull does not close.
 */
export function solidHullBrushFromPoints(source: readonly Vector3[]): SolidBrush | null {
  const points = solidHullWeldPoints(source);
  if (points.length < 4) return null;
  const triangles = SolidDualHull.triangles(points);
  if (!triangles) return null;
  const loops = solidHullLoops(points, triangles);
  if (!loops) return null;
  return SolidBrushFactory.createFromFaceLoops(loops);
}

/**
 * Drops points that sit on an earlier point.
 *
 * @param source Points to enclose.
 * @returns Unique points.
 */
function solidHullWeldPoints(source: readonly Vector3[]): Vector3[] {
  const points: Vector3[] = [];
  for (const point of source) solidHullPushWelded(points, point);
  return points;
}

/**
 * Appends a point when it is not already in the list.
 *
 * @param points Unique points.
 * @param point Candidate.
 */
function solidHullPushWelded(points: Vector3[], point: Vector3): void {
  if (points.some((existing) => existing.distanceToSquared(point) <= 1e-8)) return;
  points.push(point.clone());
}
