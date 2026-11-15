import * as THREE from 'three';

/** Thinnest piece the Blast Hole makes, in metres. */
export const BLAST_HOLE_MIN_THICKNESS = 0.02;

/** Shortest edge the Blast Hole makes, in metres. */
export const BLAST_HOLE_MIN_EDGE = 0.005;

/** Sharpest corner a Blast Hole piece may have, in degrees. */
export const BLAST_HOLE_MIN_ANGLE = 2.5;

/**
 * Returns the width of a convex polygon: the smallest distance between two
 * parallel lines that hold it, which for a convex polygon is reached with one
 * line along an edge.
 *
 * @param polygon Convex polygon, either winding.
 * @returns Width; zero for fewer than three points.
 */
export function blastHolePolygonWidth(polygon: readonly THREE.Vector2[]): number {
  if (polygon.length < 3) return 0;
  let width = Infinity;
  for (let index = 0; index < polygon.length; index++) {
    const a = polygon[index]!;
    const b = polygon[(index + 1) % polygon.length]!;
    const length = a.distanceTo(b);
    if (length === 0) return 0;
    let reach = 0;
    for (const point of polygon)
      reach = Math.max(reach, Math.abs((b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x)) / length);
    width = Math.min(width, reach);
  }
  return width;
}

/**
 * Returns the sharpest interior corner of a polygon, in degrees.
 *
 * @param polygon Polygon.
 * @returns Smallest corner angle.
 */
export function blastHolePolygonMinAngle(polygon: readonly THREE.Vector2[]): number {
  let smallest = 180;
  for (let index = 0; index < polygon.length; index++) {
    const previous = polygon[(index + polygon.length - 1) % polygon.length]!;
    const point = polygon[index]!;
    const next = polygon[(index + 1) % polygon.length]!;
    const a = previous.clone().sub(point);
    const b = next.clone().sub(point);
    const cosine = a.dot(b) / Math.max(1e-12, a.length() * b.length());
    smallest = Math.min(smallest, THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(cosine, -1, 1))));
  }
  return smallest;
}

/**
 * Returns the shortest edge of a polygon.
 *
 * @param polygon Polygon.
 * @returns Shortest edge length.
 */
export function blastHolePolygonMinEdge(polygon: readonly THREE.Vector2[]): number {
  let shortest = Infinity;
  for (let index = 0; index < polygon.length; index++)
    shortest = Math.min(shortest, polygon[index]!.distanceTo(polygon[(index + 1) % polygon.length]!));
  return shortest;
}

/**
 * Returns whether a convex polygon is a sound CSG face: no edge shorter than
 * the minimum, no part thinner than the minimum and no needle corner.
 *
 * @param polygon Convex polygon.
 * @returns True when it meets every bound.
 */
export function blastHolePolygonSound(polygon: readonly THREE.Vector2[]): boolean {
  return (
    polygon.length >= 3 &&
    blastHolePolygonMinEdge(polygon) >= BLAST_HOLE_MIN_EDGE &&
    blastHolePolygonWidth(polygon) >= BLAST_HOLE_MIN_THICKNESS &&
    blastHolePolygonMinAngle(polygon) >= BLAST_HOLE_MIN_ANGLE
  );
}

/**
 * Returns the signed area of a polygon, positive when counter-clockwise.
 *
 * @param polygon Polygon.
 * @returns Signed area.
 */
export function blastHolePolygonArea(polygon: readonly THREE.Vector2[]): number {
  let area = 0;
  polygon.forEach((point, index) => {
    const next = polygon[(index + 1) % polygon.length]!;
    area += point.x * next.y - next.x * point.y;
  });
  return area * 0.5;
}

/**
 * Returns whether a point lies inside a simple polygon (even-odd rule).
 *
 * @param polygon Polygon.
 * @param point Point.
 * @returns True inside.
 */
export function blastHolePolygonContains(polygon: readonly THREE.Vector2[], point: THREE.Vector2): boolean {
  let inside = false;
  for (let index = 0, last = polygon.length - 1; index < polygon.length; last = index++) {
    const a = polygon[index]!;
    const b = polygon[last]!;
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}
