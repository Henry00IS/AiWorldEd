import { PaintShape, paintCoverageFromDistance, paintEllipseDistance, paintStampEdgeWidth } from './paint_shape.js';

/** Ellipse parts of a left footprint: center x, center y, radius x, radius y. */
const PAINT_FOOT_PARTS: readonly (readonly [number, number, number, number])[] = [
  [0.04, 0.16, 0.3, 0.36],
  [-0.1, -0.2, 0.19, 0.34],
  [-0.03, -0.58, 0.24, 0.3],
  [0.2, 0.67, 0.14, 0.15],
  [0.0, 0.73, 0.09, 0.1],
  [-0.13, 0.69, 0.08, 0.09],
  [-0.24, 0.61, 0.07, 0.08],
  [-0.32, 0.5, 0.06, 0.07],
];

/**
 * Bare footprints that alternate left and right along a stroke, offset to
 * either side of its path like a walk.
 */
export class PaintShapeFootprints extends PaintShape {
  readonly id = 'footprints';
  readonly label = 'Footsteps';
  override readonly spacing = 0.9;
  override readonly stamp = true;
  override readonly alternatingOffset = 0.42;

  /**
   * Returns footprint coverage; odd variants are right feet.
   *
   * @param x Right coordinate.
   * @param y Up coordinate.
   * @param edge Antialiasing width.
   * @param hardness Edge hardness.
   * @param variant Dab variant byte.
   * @returns Coverage.
   */
  coverage(x: number, y: number, edge: number, hardness: number, variant: number): number {
    const footX = (variant & 1) === 0 ? x : -x;
    let distance = Number.POSITIVE_INFINITY;
    for (const [centerX, centerY, radiusX, radiusY] of PAINT_FOOT_PARTS) {
      distance = Math.min(distance, paintEllipseDistance(footX, y, centerX, centerY, radiusX, radiusY));
    }
    return paintCoverageFromDistance(distance, paintStampEdgeWidth(edge, hardness));
  }
}
