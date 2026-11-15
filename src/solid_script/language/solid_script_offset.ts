import {
  solidScriptPolygonArea,
  solidScriptPolygonConvexPieces,
  solidScriptPolygonHull,
  type SolidScriptPoint2,
} from './solid_script_polygon.js';

/** How an Offset line grows or shrinks an outline. */
export interface SolidScriptOffsetOptions {
  /** Distance in metres; below 0 shrinks the outline. */
  distance: number;
  /** True to round grown corners; false keeps them sharp. */
  round: boolean;
  /** Points of a full round corner circle. */
  sides: number;
}

/**
 * Grows or shrinks a flat outline by a distance. Growing with round corners
 * works on any outline: each convex piece grows on its own, and the grown
 * pieces together cover exactly the grown outline. Sharp corners and shrinking
 * need a convex outline.
 *
 * @param points Outline in either winding.
 * @param options Distance, rounding and corner detail.
 * @returns Convex outlines, counter-clockwise.
 */
export function solidScriptOffset(
  points: SolidScriptPoint2[],
  options: SolidScriptOffsetOptions,
): SolidScriptPoint2[][] {
  const hull = solidScriptPolygonHull(points);
  const convex =
    hull.length === points.length &&
    Math.abs(Math.abs(solidScriptPolygonArea(hull)) - Math.abs(solidScriptPolygonArea(points))) < 1e-9;
  const pieces = convex ? [hull] : solidScriptPolygonConvexPieces(points);
  if (options.distance === 0) return pieces;
  if (options.distance < 0) {
    if (!convex)
      throw new Error('a negative Distance needs a convex outline for now; split the outline into convex Polygons');
    return [solidScriptOffsetSharp(hull, options.distance)];
  }
  if (options.round) return pieces.map((piece) => solidScriptOffsetRound(piece, options.distance, options.sides));
  if (!convex)
    throw new Error(
      'sharp corners need a convex outline for now; switch Round on or split the outline into convex Polygons',
    );
  return [solidScriptOffsetSharp(hull, options.distance)];
}

/**
 * Moves every edge of a convex outline outwards by a distance and joins the
 * moved edges at their crossings, keeping sharp corners.
 *
 * @param points Convex outline, counter-clockwise.
 * @param distance Distance; below 0 moves the edges inwards.
 * @returns Moved outline.
 */
function solidScriptOffsetSharp(points: SolidScriptPoint2[], distance: number): SolidScriptPoint2[] {
  const lines = points.map((point, index) => {
    const next = points[(index + 1) % points.length]!;
    const length = Math.hypot(next[0] - point[0], next[1] - point[1]);
    const normal: SolidScriptPoint2 = [(next[1] - point[1]) / length, -(next[0] - point[0]) / length];
    return {
      from: [point[0] + normal[0] * distance, point[1] + normal[1] * distance] as SolidScriptPoint2,
      direction: [(next[0] - point[0]) / length, (next[1] - point[1]) / length] as SolidScriptPoint2,
    };
  });
  const moved = lines.map((line, index) => {
    const previous = lines[(index + lines.length - 1) % lines.length]!;
    const denominator = previous.direction[0] * line.direction[1] - previous.direction[1] * line.direction[0];
    if (Math.abs(denominator) < 1e-12) return line.from;
    const dx = line.from[0] - previous.from[0];
    const dy = line.from[1] - previous.from[1];
    const along = (dx * line.direction[1] - dy * line.direction[0]) / denominator;
    return [
      previous.from[0] + previous.direction[0] * along,
      previous.from[1] + previous.direction[1] * along,
    ] as SolidScriptPoint2;
  });
  const hull = solidScriptPolygonHull(moved);
  if (distance < 0 && (hull.length !== points.length || solidScriptPolygonArea(hull) <= 1e-9))
    throw new Error(`a Distance of ${distance} shrinks the outline away; use a smaller inset`);
  return hull;
}

/**
 * Grows a convex outline by a distance with round corners: the hull of a circle
 * around every corner.
 *
 * @param points Convex outline.
 * @param distance Distance above 0.
 * @param sides Points of a full corner circle.
 * @returns Grown outline.
 */
function solidScriptOffsetRound(points: SolidScriptPoint2[], distance: number, sides: number): SolidScriptPoint2[] {
  const circle: SolidScriptPoint2[] = [];
  for (let side = 0; side < sides; side++) {
    const angle = (side / sides) * Math.PI * 2;
    circle.push([Math.cos(angle) * distance, Math.sin(angle) * distance]);
  }
  return solidScriptPolygonHull(
    points.flatMap((point) => circle.map(([x, y]) => [point[0] + x, point[1] + y] as SolidScriptPoint2)),
  );
}
