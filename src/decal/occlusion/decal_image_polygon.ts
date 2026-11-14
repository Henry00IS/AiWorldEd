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
  const length = polygon.length;
  for (let index = 0; index < length; index += 2) {
    const next = index + 2 < length ? index + 2 : 0;
    twice += polygon[index]! * polygon[next + 1]!;
    twice -= polygon[next]! * polygon[index + 1]!;
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
  const left: number[] = [];
  const right: number[] = [];
  decalPolygonSplitInto(polygon, line[0] ?? 0, line[1] ?? 0, line[2] ?? 0, line[3] ?? 0, left, right);
  return [left, right];
}

/**
 * Splits a polygon along the line through a and b into lists the caller owns.
 * The left part lies where the line turns counter-clockwise; corners on the
 * line go to both parts.
 *
 * @param polygon Flat x, z pairs.
 * @param ax Line start x.
 * @param az Line start z.
 * @param bx Line end x.
 * @param bz Line end z.
 * @param left List receiving the left part, emptied first.
 * @param right List receiving the right part, emptied first.
 */
export function decalPolygonSplitInto(
  polygon: readonly number[],
  ax: number,
  az: number,
  bx: number,
  bz: number,
  left: number[],
  right: number[],
): void {
  decalPolygonSides(polygon, ax, az, bx, bz);
  decalPolygonSplitBySides(polygon, left, right);
}

/** Every corner lies strictly left of the line. */
export const DECAL_POLYGON_ALL_LEFT = 1;
/** Every corner lies strictly right of the line. */
export const DECAL_POLYGON_ALL_RIGHT = 2;
/** Corners lie on both sides or on the line. */
export const DECAL_POLYGON_MIXED = 0;

/** Side of each corner from the last decalPolygonSides call. */
let decalPolygonSideValues = new Float64Array(64);

/**
 * Works out which side of the line through a and b each corner lies on, keeping
 * the values for decalPolygonSplitBySides.
 *
 * @param polygon Flat x, z pairs.
 * @param ax Line start x.
 * @param az Line start z.
 * @param bx Line end x.
 * @param bz Line end z.
 * @returns DECAL_POLYGON_ALL_LEFT, DECAL_POLYGON_ALL_RIGHT or
 *   DECAL_POLYGON_MIXED.
 */
export function decalPolygonSides(polygon: readonly number[], ax: number, az: number, bx: number, bz: number): number {
  const count = polygon.length >> 1;
  if (decalPolygonSideValues.length < count) decalPolygonSideValues = new Float64Array(count * 2);
  const sides = decalPolygonSideValues;
  const ex = bx - ax;
  const ez = bz - az;
  let left = true;
  let right = true;
  for (let corner = 0; corner < count; corner++) {
    const side = ex * (polygon[corner * 2 + 1]! - az) - ez * (polygon[corner * 2]! - ax);
    sides[corner] = side;
    if (!(side > 0)) left = false;
    if (!(side < 0)) right = false;
  }
  if (count === 0) return DECAL_POLYGON_MIXED;
  return left ? DECAL_POLYGON_ALL_LEFT : right ? DECAL_POLYGON_ALL_RIGHT : DECAL_POLYGON_MIXED;
}

/**
 * Splits a polygon by the sides the last decalPolygonSides call found.
 *
 * @param polygon Polygon given to decalPolygonSides.
 * @param left List receiving the left part, emptied first.
 * @param right List receiving the right part, emptied first.
 */
export function decalPolygonSplitBySides(polygon: readonly number[], left: number[], right: number[]): void {
  left.length = 0;
  right.length = 0;
  const sides = decalPolygonSideValues;
  const count = polygon.length >> 1;
  for (let corner = 0; corner < count; corner++) {
    const next = corner + 1 < count ? corner + 1 : 0;
    const px = polygon[corner * 2]!;
    const pz = polygon[corner * 2 + 1]!;
    const sp = sides[corner]!;
    const sq = sides[next]!;
    if (sp >= 0) left.push(px, pz);
    if (sp <= 0) right.push(px, pz);
    if ((sp > 0 && sq < 0) || (sp < 0 && sq > 0)) {
      const qx = polygon[next * 2]!;
      const qz = polygon[next * 2 + 1]!;
      const t = sp / (sp - sq);
      const x = px + (qx - px) * t;
      const z = pz + (qz - pz) * t;
      left.push(x, z);
      right.push(x, z);
    }
  }
}

/**
 * Returns whether the bounding boxes of two polygons overlap.
 *
 * @param first Flat x, z pairs.
 * @param second Flat x, z pairs.
 * @returns True when the boxes share area or touch.
 */
export function decalPolygonBoxesMeet(first: readonly number[], second: readonly number[]): boolean {
  const a = decalPolygonBoxInto(first, DECAL_POLYGON_BOX_FIRST);
  const b = decalPolygonBoxInto(second, DECAL_POLYGON_BOX_SECOND);
  return a[0]! <= b[1]! && b[0]! <= a[1]! && a[2]! <= b[3]! && b[2]! <= a[3]!;
}

/** Scratch boxes for the box test. */
const DECAL_POLYGON_BOX_FIRST = new Float64Array(4);
const DECAL_POLYGON_BOX_SECOND = new Float64Array(4);

/**
 * Returns the bounding box of a polygon.
 *
 * @param polygon Flat x, z pairs.
 * @returns Minimum x, maximum x, minimum z, maximum z.
 */
export function decalPolygonBox(polygon: readonly number[]): [number, number, number, number] {
  const box = decalPolygonBoxInto(polygon, DECAL_POLYGON_BOX_FIRST);
  return [box[0]!, box[1]!, box[2]!, box[3]!];
}

/**
 * Writes the bounding box of a polygon into a caller's array.
 *
 * @param polygon Flat x, z pairs.
 * @param box Array receiving minimum x, maximum x, minimum z, maximum z.
 * @returns The same array.
 */
export function decalPolygonBoxInto(polygon: readonly number[], box: Float64Array): Float64Array {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let index = 0; index < polygon.length; index += 2) {
    const x = polygon[index]!;
    const z = polygon[index + 1]!;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  box[0] = minX;
  box[1] = maxX;
  box[2] = minZ;
  box[3] = maxZ;
  return box;
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
  const length = shadow.length;
  for (let index = 0; index < length; index += 2) {
    const next = index + 2 < length ? index + 2 : 0;
    const placement = decalPolygonSides(rest, shadow[index]!, shadow[index + 1]!, shadow[next]!, shadow[next + 1]!);
    // Wholly inside this edge: nothing goes out and the rest stays as it is,
    // ending the cut as a split would when the piece itself is too small.
    if (placement === DECAL_POLYGON_ALL_LEFT) {
      if (rest !== piece) continue;
      if (rest.length < 6 || Math.abs(decalPolygonSignedArea(rest)) <= DECAL_POLYGON_AREA_MINIMUM) return;
      continue;
    }
    if (placement === DECAL_POLYGON_ALL_RIGHT) {
      if (rest.length >= 6 && Math.abs(decalPolygonSignedArea(rest)) > DECAL_POLYGON_AREA_MINIMUM)
        out.push(rest.slice());
      return;
    }
    const inside = rest === DECAL_POLYGON_INSIDE_FIRST ? DECAL_POLYGON_INSIDE_SECOND : DECAL_POLYGON_INSIDE_FIRST;
    const outside: number[] = [];
    decalPolygonSplitBySides(rest, inside, outside);
    if (outside.length >= 6 && Math.abs(decalPolygonSignedArea(outside)) > DECAL_POLYGON_AREA_MINIMUM)
      out.push(outside);
    if (inside.length < 6 || Math.abs(decalPolygonSignedArea(inside)) <= DECAL_POLYGON_AREA_MINIMUM) return;
    rest = inside;
  }
}

/** Scratch lists the shrinking inside part alternates between while subtracting. */
const DECAL_POLYGON_INSIDE_FIRST: number[] = [];
const DECAL_POLYGON_INSIDE_SECOND: number[] = [];
