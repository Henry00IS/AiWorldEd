import { PaintShape, paintCoverageFromDistance, paintEllipseDistance, paintStampEdgeWidth } from './paint_shape.js';

/** Droplets around a splat: angle in turns, distance, radius. */
const PAINT_SPLAT_DROPS: readonly (readonly [number, number, number])[] = [
  [0.05, 0.82, 0.09],
  [0.19, 0.74, 0.06],
  [0.33, 0.88, 0.07],
  [0.47, 0.7, 0.1],
  [0.61, 0.86, 0.05],
  [0.72, 0.78, 0.08],
  [0.87, 0.9, 0.06],
];

/** A paint splat: a wobbly blob with droplets, rotated per dab. */
export class PaintShapeSplat extends PaintShape {
  readonly id = 'splat';
  readonly label = 'Splat';
  override readonly spacing = 0.7;
  override readonly stamp = true;

  /**
   * Returns splat coverage.
   *
   * @param x Right coordinate.
   * @param y Up coordinate.
   * @param edge Antialiasing width.
   * @param hardness Edge hardness.
   * @param variant Dab variant byte (varies the wobble).
   * @returns Coverage.
   */
  coverage(x: number, y: number, edge: number, hardness: number, variant: number): number {
    const phase = variant * 1.7;
    const angle = Math.atan2(y, x);
    const blob = 0.52 + 0.08 * Math.sin(5 * angle + phase) + 0.05 * Math.sin(11 * angle + 2 * phase);
    let distance = Math.hypot(x, y) - blob;
    for (const [turns, reach, radius] of PAINT_SPLAT_DROPS) {
      const dropAngle = (turns + variant * 0.13) * Math.PI * 2;
      const dropX = Math.cos(dropAngle) * reach;
      const dropY = Math.sin(dropAngle) * reach;
      distance = Math.min(distance, paintEllipseDistance(x, y, dropX, dropY, radius, radius));
    }
    return paintCoverageFromDistance(distance, paintStampEdgeWidth(edge, hardness));
  }
}
