import { PaintShape, paintCoverageFromDistance, paintStampEdgeWidth } from './paint_shape.js';

/** A heart. */
export class PaintShapeHeart extends PaintShape {
  readonly id = 'heart';
  readonly label = 'Heart';
  override readonly spacing = 1.1;
  override readonly stamp = true;

  /**
   * Returns heart coverage from the implicit heart curve.
   *
   * @param x Right coordinate.
   * @param y Up coordinate.
   * @param edge Antialiasing width.
   * @param hardness Edge hardness.
   * @param _variant Unused.
   * @returns Coverage.
   */
  coverage(x: number, y: number, edge: number, hardness: number, _variant: number): number {
    const scaledX = x * 1.25;
    const scaledY = y * 1.25 + 0.15;
    const base = scaledX * scaledX + scaledY * scaledY - 1;
    const implicit = base * base * base - scaledX * scaledX * scaledY * scaledY * scaledY;
    const distance = Math.cbrt(implicit) * 0.45;
    return paintCoverageFromDistance(distance, paintStampEdgeWidth(edge, hardness));
  }
}
