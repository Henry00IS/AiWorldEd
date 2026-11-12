/**
 * A dab shape: coverage of a point in the dab's normalized frame, where the dab
 * spans -1..1 on both axes and +y points along the dab's up direction.
 */
export abstract class PaintShape {
  /** Persisted shape id. */
  abstract readonly id: string;
  /** Title Case label shown in the palette. */
  abstract readonly label: string;
  /** Distance between dabs as a fraction of the diameter. */
  readonly spacing: number = 0.12;
  /**
   * True when the shape is printed as separate stamps rather than a smooth
   * line.
   */
  readonly stamp: boolean = false;
  /**
   * Sideways offset of every other stamp as a fraction of the radius
   * (footsteps).
   */
  readonly alternatingOffset: number = 0;

  /**
   * Returns coverage at a normalized point.
   *
   * @param x Right coordinate, -1..1 spans the dab.
   * @param y Up coordinate, -1..1 spans the dab.
   * @param edge Antialiasing width in normalized units.
   * @param hardness Edge hardness 0..1.
   * @param dabIndex Index of the dab in its stroke.
   * @returns Coverage 0..1.
   */
  abstract coverage(x: number, y: number, edge: number, hardness: number, dabIndex: number): number;
}

/**
 * Hermite smoothstep.
 *
 * @param edge0 Lower edge.
 * @param edge1 Upper edge.
 * @param value Input.
 * @returns 0..1.
 */
export function paintSmoothstep(edge0: number, edge1: number, value: number): number {
  if (edge1 <= edge0) return value < edge0 ? 0 : 1;
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Turns a signed distance (negative inside) into antialiased coverage.
 *
 * @param distance Signed distance in normalized units.
 * @param width Softening width.
 * @returns Coverage 0..1.
 */
export function paintCoverageFromDistance(distance: number, width: number): number {
  const half = Math.max(1e-4, width) * 0.5;
  return 1 - paintSmoothstep(-half, half, distance);
}

/**
 * Approximate signed distance to an axis-aligned ellipse.
 *
 * @param x Point x.
 * @param y Point y.
 * @param centerX Ellipse center x.
 * @param centerY Ellipse center y.
 * @param radiusX Radius along x.
 * @param radiusY Radius along y.
 * @returns Signed distance, negative inside.
 */
export function paintEllipseDistance(
  x: number,
  y: number,
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
): number {
  const normalized = Math.hypot((x - centerX) / radiusX, (y - centerY) / radiusY);
  return (normalized - 1) * Math.min(radiusX, radiusY);
}

/**
 * Returns the softening width of a stamp edge.
 *
 * @param edge Antialiasing width.
 * @param hardness Hardness 0..1.
 * @returns Width.
 */
export function paintStampEdgeWidth(edge: number, hardness: number): number {
  return Math.max(edge, (1 - hardness) * 0.35);
}
