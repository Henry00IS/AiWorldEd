import * as THREE from 'three';
import type { SolidScriptPoint2 } from './solid_script_polygon.js';

/**
 * Lays the points of a closed Path in the drawing plane of Linear Extrude,
 * Rotate Extrude and Offset, from the plane it lies in: a path on the ground
 * keeps X and runs its depth to the back, as the drawing's Y; an upright path
 * keeps its height as Y. The corners turn counter-clockwise.
 *
 * @param points Sampled points in script space.
 * @returns Corners in the drawing plane.
 */
export function solidScriptPathFlat(points: readonly THREE.Vector3[]): SolidScriptPoint2[] {
  const normal = new THREE.Vector3();
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length] ?? point;
    normal.x += (point.y - next.y) * (point.z + next.z);
    normal.y += (point.z - next.z) * (point.x + next.x);
    normal.z += (point.x - next.x) * (point.y + next.y);
  });
  const [x, y, z] = [Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z)];
  if (Math.max(x, y, z) < 1e-12)
    throw new Error('this Path encloses nothing to fill; give it corners that do not all lie on one line');
  const flat = points.map((point): SolidScriptPoint2 =>
    y >= x && y >= z ? [point.x, -point.z] : z >= x ? [point.x, point.y] : [point.z, point.y],
  );
  return THREE.ShapeUtils.isClockWise(flat.map(([u, v]) => new THREE.Vector2(u, v))) ? flat.reverse() : flat;
}

/**
 * Drops points of a closed path that repeat the point before them, the last one
 * included when it lands back on the first, as a full Arc does.
 *
 * @param points Points in order.
 * @returns Points without repeats.
 */
export function solidScriptPathLoopOpen(points: readonly THREE.Vector3[]): THREE.Vector3[] {
  return points.filter((point, index) => {
    const before = points[index === 0 ? points.length - 1 : index - 1];
    return points.length < 2 || !before || before.distanceTo(point) > 1e-9;
  });
}
