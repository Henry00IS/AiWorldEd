import { PaintShape, paintCoverageFromDistance, paintStampEdgeWidth } from './paint_shape.js';

/** A five-pointed star. */
export class PaintShapeStar extends PaintShape {
  readonly id = 'star';
  readonly label = 'Star';
  override readonly spacing = 1.1;
  override readonly stamp = true;

  /**
   * Returns star coverage.
   *
   * @param x Right coordinate.
   * @param y Up coordinate.
   * @param edge Antialiasing width.
   * @param hardness Edge hardness.
   * @param _dabIndex Unused.
   * @returns Coverage.
   */
  coverage(x: number, y: number, edge: number, hardness: number, _dabIndex: number): number {
    const sector = (Math.PI * 2) / 5;
    const angle = Math.atan2(x, y);
    const local = Math.abs(((((angle % sector) + sector) % sector) - sector / 2) / (sector / 2));
    const outer = 0.95;
    const inner = 0.4;
    const boundary = inner + (outer - inner) * Math.pow(local, 1.6);
    const distance = (Math.hypot(x, y) - boundary) * 0.6;
    return paintCoverageFromDistance(distance, paintStampEdgeWidth(edge, hardness));
  }
}
