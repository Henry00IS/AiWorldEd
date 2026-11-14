import * as THREE from 'three';
import type { Sketch, SketchShape } from './sketch_model.js';

/**
 * Turns the shapes of a sketch into closed 2D outlines (U, V),
 * counter-clockwise. Rectangles, circles and polygons are their own outline; an
 * arc becomes a curved band and a polyline one band per span.
 *
 * @param sketch Sketch.
 * @returns Outlines.
 */
export function sketchOutlines(sketch: Sketch): THREE.Vector2[][] {
  return sketch.shapes
    .flatMap(sketchShapeOutlines)
    .map(sketchCounterClockwise)
    .filter((loop) => loop.length >= 3);
}

/**
 * Returns the outlines of one shape.
 *
 * @param shape Shape.
 * @returns Outlines.
 */
export function sketchShapeOutlines(shape: SketchShape): THREE.Vector2[][] {
  switch (shape.type) {
    case 'rectangle': {
      const [w, h] = [shape.width / 2, shape.height / 2];
      return [
        [
          new THREE.Vector2(shape.u - w, shape.v - h),
          new THREE.Vector2(shape.u + w, shape.v - h),
          new THREE.Vector2(shape.u + w, shape.v + h),
          new THREE.Vector2(shape.u - w, shape.v + h),
        ],
      ];
    }
    case 'circle':
      return [
        Array.from({ length: shape.sides }, (_, index) => {
          const angle = (index / shape.sides) * Math.PI * 2;
          return new THREE.Vector2(shape.u + Math.cos(angle) * shape.radius, shape.v + Math.sin(angle) * shape.radius);
        }),
      ];
    case 'arc':
      return sketchArcBands(shape.u, shape.v, shape.radius, shape.start, shape.sweep, shape.thickness, shape.sides);
    case 'polygon':
      return [shape.points.map((point) => new THREE.Vector2(point.u, point.v))];
    case 'polyline':
      return sketchPolylineBands(
        shape.points.map((point) => new THREE.Vector2(point.u, point.v)),
        shape.thickness,
      );
  }
}

/**
 * Splits an arc band into one convex quad per side.
 *
 * @param u Centre U.
 * @param v Centre V.
 * @param radius Arc radius at the band centre.
 * @param start Start angle in degrees.
 * @param sweep Sweep in degrees.
 * @param thickness Band width.
 * @param sides Quads over the sweep.
 * @returns Quads.
 */
function sketchArcBands(
  u: number,
  v: number,
  radius: number,
  start: number,
  sweep: number,
  thickness: number,
  sides: number,
): THREE.Vector2[][] {
  const inner = Math.max(0, radius - thickness / 2);
  const outer = radius + thickness / 2;
  const at = (r: number, angle: number): THREE.Vector2 =>
    new THREE.Vector2(u + Math.cos(angle) * r, v + Math.sin(angle) * r);
  const count = Math.max(1, Math.round((sides * Math.abs(sweep)) / 360));
  const bands: THREE.Vector2[][] = [];
  for (let index = 0; index < count; index++) {
    const a = THREE.MathUtils.degToRad(start + (sweep * index) / count);
    const b = THREE.MathUtils.degToRad(start + (sweep * (index + 1)) / count);
    bands.push([at(inner, a), at(outer, a), at(outer, b), at(inner, b)]);
  }
  return bands;
}

/**
 * Builds one rectangle per span of an open line, each widened by half the
 * thickness to either side and lengthened by it at both ends so joints close.
 *
 * @param points Line points.
 * @param thickness Strip width.
 * @returns Rectangles.
 */
function sketchPolylineBands(points: THREE.Vector2[], thickness: number): THREE.Vector2[][] {
  const bands: THREE.Vector2[][] = [];
  const half = thickness / 2;
  for (let index = 0; index + 1 < points.length; index++) {
    const a = points[index]!;
    const b = points[index + 1]!;
    const along = b.clone().sub(a);
    if (along.lengthSq() < 1e-12) continue;
    along.normalize().multiplyScalar(half);
    const side = new THREE.Vector2(-along.y, along.x);
    const start = a.clone().sub(along);
    const end = b.clone().add(along);
    bands.push([start.clone().sub(side), end.clone().sub(side), end.clone().add(side), start.clone().add(side)]);
  }
  return bands;
}

/**
 * Returns the signed area of an outline.
 *
 * @param loop Outline.
 * @returns Area, positive when counter-clockwise.
 */
export function sketchArea(loop: readonly THREE.Vector2[]): number {
  let area = 0;
  loop.forEach((point, index) => {
    const next = loop[(index + 1) % loop.length]!;
    area += point.x * next.y - next.x * point.y;
  });
  return area / 2;
}

/**
 * Returns an outline wound counter-clockwise, without repeated points.
 *
 * @param loop Outline.
 * @returns Counter-clockwise outline.
 */
function sketchCounterClockwise(loop: THREE.Vector2[]): THREE.Vector2[] {
  const distinct = loop.filter((point, index) => point.distanceToSquared(loop[(index + 1) % loop.length]!) > 1e-12);
  return sketchArea(distinct) < 0 ? distinct.reverse() : distinct;
}
