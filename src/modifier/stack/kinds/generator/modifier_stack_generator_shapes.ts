import * as THREE from 'three';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';

/** Smallest edge or area a generated piece may have, in metres. */
export const MODIFIER_STACK_SHAPE_EPSILON = 1e-4;

/**
 * Builds a convex brush from face loops, turning every loop to face outward.
 *
 * @param loops Convex polygon loops in any winding.
 * @returns Brush, or null when the loops do not close a convex solid.
 */
export function modifierStackConvexFromLoops(loops: THREE.Vector3[][]): SolidBrush | null {
  const center = new THREE.Vector3();
  let count = 0;
  for (const loop of loops) for (const point of loop) (center.add(point), (count += 1));
  if (count === 0) return null;
  center.divideScalar(count);
  const oriented = loops.map((loop) => modifierStackLoopOutward(loop, center));
  return SolidBrushFactory.createFromFaceLoops(oriented);
}

/**
 * Extrudes a convex 2D profile through the depth of a box.
 *
 * @param profile Convex profile points (span coordinate, height).
 * @param spanAxis 'x' spans along X and extrudes along Z; 'z' the reverse.
 * @param box Volume box that supplies the span centre and the depth.
 * @returns Prism brush, or null for a degenerate profile.
 */
export function modifierStackPrism(
  profile: readonly THREE.Vector2[],
  spanAxis: string,
  box: THREE.Box3,
): SolidBrush | null {
  if (Math.abs(modifierStackProfileArea(profile)) < MODIFIER_STACK_SHAPE_EPSILON * MODIFIER_STACK_SHAPE_EPSILON)
    return null;
  const center = box.getCenter(new THREE.Vector3());
  const toPoint = (point: THREE.Vector2, depth: number): THREE.Vector3 =>
    spanAxis === 'z'
      ? new THREE.Vector3(depth, point.y, center.z + point.x)
      : new THREE.Vector3(center.x + point.x, point.y, depth);
  const near = spanAxis === 'z' ? box.min.x : box.min.z;
  const far = spanAxis === 'z' ? box.max.x : box.max.z;
  const front = profile.map((point) => toPoint(point, far));
  const back = profile.map((point) => toPoint(point, near));
  return modifierStackConvexFromLoops([front, back, ...modifierStackSideLoops(back, front)]);
}

/**
 * Builds a regular N-gon frustum around the vertical axis.
 *
 * @param center Centre of the bottom ring.
 * @param sides Side count.
 * @param bottomRadius Bottom circumradius.
 * @param topRadius Top circumradius.
 * @param height Frustum height.
 * @returns Frustum brush, or null when degenerate.
 */
export function modifierStackFrustum(
  center: THREE.Vector3,
  sides: number,
  bottomRadius: number,
  topRadius: number,
  height: number,
): SolidBrush | null {
  if (height < MODIFIER_STACK_SHAPE_EPSILON || Math.min(bottomRadius, topRadius) < MODIFIER_STACK_SHAPE_EPSILON)
    return null;
  const ring = (radius: number, y: number): THREE.Vector3[] =>
    Array.from({ length: sides }, (_, index) => {
      const angle = (index / sides) * Math.PI * 2 + Math.PI / sides;
      return new THREE.Vector3(center.x + Math.cos(angle) * radius, y, center.z + Math.sin(angle) * radius);
    });
  const bottom = ring(bottomRadius, center.y);
  const top = ring(topRadius, center.y + height);
  return modifierStackConvexFromLoops([bottom, top, ...modifierStackSideLoops(bottom, top)]);
}

/**
 * Builds the quads joining two matching rings.
 *
 * @param lower First ring.
 * @param upper Second ring with the same point count.
 * @returns One quad per ring edge.
 */
function modifierStackSideLoops(lower: readonly THREE.Vector3[], upper: readonly THREE.Vector3[]): THREE.Vector3[][] {
  const loops: THREE.Vector3[][] = [];
  for (let index = 0; index < lower.length; index++) {
    const next = (index + 1) % lower.length;
    const a = lower[index];
    const b = lower[next];
    const c = upper[next];
    const d = upper[index];
    if (a && b && c && d) loops.push([a, b, c, d]);
  }
  return loops;
}

/**
 * Returns a loop wound so its Newell normal points away from a centre.
 *
 * @param loop Polygon loop.
 * @param center Point inside the solid.
 * @returns The loop or its reverse.
 */
function modifierStackLoopOutward(loop: THREE.Vector3[], center: THREE.Vector3): THREE.Vector3[] {
  const normal = new THREE.Vector3();
  const centroid = new THREE.Vector3();
  loop.forEach((point, index) => {
    const next = loop[(index + 1) % loop.length] ?? point;
    normal.x += (point.y - next.y) * (point.z + next.z);
    normal.y += (point.z - next.z) * (point.x + next.x);
    normal.z += (point.x - next.x) * (point.y + next.y);
    centroid.add(point);
  });
  centroid.divideScalar(Math.max(1, loop.length)).sub(center);
  return normal.dot(centroid) < 0 ? [...loop].reverse() : loop;
}

/**
 * Returns the signed area of a 2D polygon.
 *
 * @param profile Polygon points.
 * @returns Signed area.
 */
function modifierStackProfileArea(profile: readonly THREE.Vector2[]): number {
  let area = 0;
  profile.forEach((point, index) => {
    const next = profile[(index + 1) % profile.length] ?? point;
    area += point.x * next.y - next.x * point.y;
  });
  return area * 0.5;
}
