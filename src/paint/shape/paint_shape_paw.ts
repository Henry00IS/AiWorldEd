import { PaintShape, paintCoverageFromDistance, paintEllipseDistance, paintStampEdgeWidth } from './paint_shape.js';

/** Ellipse parts of a paw print: center x, center y, radius x, radius y. */
const PAINT_PAW_PARTS: readonly (readonly [number, number, number, number])[] = [
  [0, -0.32, 0.4, 0.32],
  [-0.5, 0.22, 0.16, 0.21],
  [-0.18, 0.55, 0.17, 0.22],
  [0.18, 0.55, 0.17, 0.22],
  [0.5, 0.22, 0.16, 0.21],
];

/** Animal paw prints that trail along a stroke. */
export class PaintShapePaw extends PaintShape {
  readonly id = 'paw';
  readonly label = 'Paw Prints';
  override readonly spacing = 0.8;
  override readonly stamp = true;
  override readonly alternatingOffset = 0.35;

  /**
   * Returns paw coverage.
   *
   * @param x Right coordinate.
   * @param y Up coordinate.
   * @param edge Antialiasing width.
   * @param hardness Edge hardness.
   * @param _dabIndex Unused.
   * @returns Coverage.
   */
  coverage(x: number, y: number, edge: number, hardness: number, _dabIndex: number): number {
    let distance = Number.POSITIVE_INFINITY;
    for (const [centerX, centerY, radiusX, radiusY] of PAINT_PAW_PARTS) {
      distance = Math.min(distance, paintEllipseDistance(x, y, centerX, centerY, radiusX, radiusY));
    }
    return paintCoverageFromDistance(distance, paintStampEdgeWidth(edge, hardness));
  }
}
