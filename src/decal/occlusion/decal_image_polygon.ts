/**
 * Convex polygons in the image plane of a projector, stored as flat lists of x
 * and z pairs. A polygon winds counter-clockwise when its signed area is
 * positive; the clipping helpers keep the winding they are given.
 */

/** Pieces whose area falls below this are too small to draw. */
export const DECAL_POLYGON_AREA_MINIMUM = 1e-12;

/**
 * Returns the signed area of a polygon, positive when counter-clockwise.
 *
 * @param polygon Flat x, z pairs.
 * @returns Signed area.
 */
export function decalPolygonSignedArea(polygon: readonly number[]): number {
  let twice = 0;
  const count = polygon.length / 2;
  for (let corner = 0; corner < count; corner++) {
    const next = (corner + 1) % count;
    twice += (polygon[corner * 2] ?? 0) * (polygon[next * 2 + 1] ?? 0);
    twice -= (polygon[next * 2] ?? 0) * (polygon[corner * 2 + 1] ?? 0);
  }
  return twice / 2;
}

/**
 * Splits a polygon along the line through a and b. The left part lies where the
 * line turns counter-clockwise; corners on the line go to both parts.
 *
 * @param polygon Flat x, z pairs.
 * @param line Line as start x, start z, end x, end z.
 * @returns Left and right parts, each possibly empty.
 */
export function decalPolygonSplit(polygon: readonly number[], line: readonly number[]): [number[], number[]] {
  const [ax = 0, az = 0, bx = 0, bz = 0] = line;
  const left: number[] = [];
  const right: number[] = [];
  const count = polygon.length / 2;
  const sideOf = (x: number, z: number) => (bx - ax) * (z - az) - (bz - az) * (x - ax);
  for (let corner = 0; corner < count; corner++) {
    const next = (corner + 1) % count;
    const px = polygon[corner * 2] ?? 0;
    const pz = polygon[corner * 2 + 1] ?? 0;
    const qx = polygon[next * 2] ?? 0;
    const qz = polygon[next * 2 + 1] ?? 0;
    const sp = sideOf(px, pz);
    const sq = sideOf(qx, qz);
    if (sp >= 0) left.push(px, pz);
    if (sp <= 0) right.push(px, pz);
    if ((sp > 0 && sq < 0) || (sp < 0 && sq > 0)) {
      const t = sp / (sp - sq);
      const x = px + (qx - px) * t;
      const z = pz + (qz - pz) * t;
      left.push(x, z);
      right.push(x, z);
    }
  }
  return [left, right];
}

/**
 * Returns whether the bounding boxes of two polygons overlap.
 *
 * @param first Flat x, z pairs.
 * @param second Flat x, z pairs.
 * @returns True when the boxes share area or touch.
 */
export function decalPolygonBoxesMeet(first: readonly number[], second: readonly number[]): boolean {
  const a = decalPolygonBox(first);
  const b = decalPolygonBox(second);
  return a[0] <= b[1] && b[0] <= a[1] && a[2] <= b[3] && b[2] <= a[3];
}

/**
 * Returns the bounding box of a polygon.
 *
 * @param polygon Flat x, z pairs.
 * @returns Minimum x, maximum x, minimum z, maximum z.
 */
export function decalPolygonBox(polygon: readonly number[]): [number, number, number, number] {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let index = 0; index < polygon.length; index += 2) {
    const x = polygon[index] ?? 0;
    const z = polygon[index + 1] ?? 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return [minX, maxX, minZ, maxZ];
}

/**
 * Removes a counter-clockwise convex shadow from a convex piece. What stays is
 * a list of convex pieces, cut off the piece one shadow edge at a time.
 *
 * @param piece Convex piece.
 * @param shadow Counter-clockwise convex shadow.
 * @param out List receiving the uncovered pieces.
 */
export function decalPolygonSubtract(piece: readonly number[], shadow: readonly number[], out: number[][]): void {
  if (!decalPolygonBoxesMeet(piece, shadow)) {
    out.push(piece as number[]);
    return;
  }
  let rest: readonly number[] = piece;
  const count = shadow.length / 2;
  for (let corner = 0; corner < count; corner++) {
    const next = (corner + 1) % count;
    const line = [
      shadow[corner * 2] ?? 0,
      shadow[corner * 2 + 1] ?? 0,
      shadow[next * 2] ?? 0,
      shadow[next * 2 + 1] ?? 0,
    ];
    const [inside, outside] = decalPolygonSplit(rest, line);
    if (outside.length >= 6 && Math.abs(decalPolygonSignedArea(outside)) > DECAL_POLYGON_AREA_MINIMUM)
      out.push(outside);
    if (inside.length < 6 || Math.abs(decalPolygonSignedArea(inside)) <= DECAL_POLYGON_AREA_MINIMUM) return;
    rest = inside;
  }
}
