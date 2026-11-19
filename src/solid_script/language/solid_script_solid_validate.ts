import type * as THREE from 'three';
import { solidHullBrushFromPoints } from '@/solid/algorithm/surface/solid_hull_brush.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import { SOLID_SCRIPT_GEOMETRY_EPSILON } from './solid_script_geometry.js';

/**
 * Stops an in-place brush edit when the corners would no longer make a convex
 * brush, using the editor's brush check.
 *
 * @param points New corners.
 * @param label Command or line, for the message.
 */
export function solidScriptSolidValidate(points: readonly THREE.Vector3[], label: string): void {
  const unique = solidScriptSolidUnique(points);
  const brush = solidHullBrushFromPoints(unique.map((point) => point.clone()));
  const valid = brush && unique.every((point) => solidScriptSolidOnHull(point, brush.vertices));
  if (!valid || !brush || !SolidBrushValidator.validate(brush).valid)
    throw new Error(`${label} is no longer a convex brush`);
}

/**
 * Drops corners that sit on an earlier corner.
 *
 * @param points Corners.
 * @returns Unique corners.
 */
function solidScriptSolidUnique(points: readonly THREE.Vector3[]): THREE.Vector3[] {
  const unique: THREE.Vector3[] = [];
  for (const point of points)
    if (!unique.some((known) => known.distanceTo(point) <= SOLID_SCRIPT_GEOMETRY_EPSILON)) unique.push(point);
  return unique;
}

/**
 * Tells whether a corner sits on a hull vertex.
 *
 * @param point Corner.
 * @param vertices Hull vertices.
 * @returns True when it does.
 */
function solidScriptSolidOnHull(point: THREE.Vector3, vertices: readonly THREE.Vector3[]): boolean {
  return vertices.some((vertex) => vertex.distanceTo(point) <= SOLID_SCRIPT_GEOMETRY_EPSILON);
}
