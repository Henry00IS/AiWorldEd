import type * as THREE from 'three';

/**
 * Returns the cross product of (b - a) and (c - a).
 *
 * @param a First point.
 * @param b Second point.
 * @param c Third point.
 * @returns Twice the signed area of the triangle.
 */
export function blastHoleCross(a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/**
 * Returns whether two segments touch or cross, ends included.
 *
 * @param a Start of the first segment.
 * @param b End of the first segment.
 * @param c Start of the second segment.
 * @param d End of the second segment.
 * @returns True when they share a point.
 */
export function blastHoleSegmentsTouch(
  a: THREE.Vector2,
  b: THREE.Vector2,
  c: THREE.Vector2,
  d: THREE.Vector2,
): boolean {
  const d1 = blastHoleCross(c, d, a);
  const d2 = blastHoleCross(c, d, b);
  const d3 = blastHoleCross(a, b, c);
  const d4 = blastHoleCross(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  return (
    (d1 === 0 && blastHoleOnSegment(c, d, a)) ||
    (d2 === 0 && blastHoleOnSegment(c, d, b)) ||
    (d3 === 0 && blastHoleOnSegment(a, b, c)) ||
    (d4 === 0 && blastHoleOnSegment(a, b, d))
  );
}

/**
 * Returns whether a point on the line through a segment lies within it.
 *
 * @param a Segment start.
 * @param b Segment end.
 * @param point Point on the line.
 * @returns True within the segment's bounds.
 */
function blastHoleOnSegment(a: THREE.Vector2, b: THREE.Vector2, point: THREE.Vector2): boolean {
  return (
    Math.min(a.x, b.x) <= point.x &&
    point.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= point.y &&
    point.y <= Math.max(a.y, b.y)
  );
}

/**
 * Returns whether the chord between two polygon corners crosses or touches any
 * polygon edge other than the ones at its own ends.
 *
 * @param polygon Polygon.
 * @param from Index of the chord start.
 * @param to Index of the chord end.
 * @returns True when the chord hits another edge.
 */
export function blastHoleChordHitsEdges(polygon: readonly THREE.Vector2[], from: number, to: number): boolean {
  const count = polygon.length;
  for (let index = 0; index < count; index++) {
    const next = (index + 1) % count;
    if (index === from || index === to || next === from || next === to) continue;
    if (blastHoleSegmentsTouch(polygon[from]!, polygon[to]!, polygon[index]!, polygon[next]!)) return true;
  }
  return false;
}

/**
 * Returns whether a polygon is simple: no two edges that are not neighbours
 * touch, and no edge has zero length.
 *
 * @param polygon Polygon.
 * @returns True when simple.
 */
export function blastHolePolygonSimple(polygon: readonly THREE.Vector2[]): boolean {
  const count = polygon.length;
  if (count < 3) return false;
  for (let index = 0; index < count; index++) {
    const next = (index + 1) % count;
    if (polygon[index]!.equals(polygon[next]!)) return false;
    for (let other = index + 2; other < count; other++) {
      const otherNext = (other + 1) % count;
      if (otherNext === index) continue;
      if (blastHoleSegmentsTouch(polygon[index]!, polygon[next]!, polygon[other]!, polygon[otherNext]!)) return false;
    }
  }
  return true;
}

/**
 * Returns the distance from a point to a segment.
 *
 * @param a Segment start.
 * @param b Segment end.
 * @param point Point.
 * @returns Distance.
 */
export function blastHoleSegmentDistance(a: THREE.Vector2, b: THREE.Vector2, point: THREE.Vector2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const share = lengthSq > 0 ? Math.min(1, Math.max(0, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq)) : 0;
  return Math.hypot(a.x + dx * share - point.x, a.y + dy * share - point.y);
}
