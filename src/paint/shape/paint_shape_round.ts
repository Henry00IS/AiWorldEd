import { PaintShape, paintSmoothstep } from './paint_shape.js';

/** Round brush tip with a hardness-controlled soft edge. */
export class PaintShapeRound extends PaintShape {
  readonly id = 'round';
  readonly label = 'Round';

  /**
   * Returns round coverage.
   *
   * @param x Right coordinate.
   * @param y Up coordinate.
   * @param edge Antialiasing width.
   * @param hardness Hardness 0..1.
   * @param _variant Unused.
   * @returns Coverage.
   */
  coverage(x: number, y: number, edge: number, hardness: number, _variant: number): number {
    const distance = Math.hypot(x, y);
    if (distance >= 1) return 0;
    const start = Math.min(Math.max(0, hardness), 1 - Math.min(1, edge));
    return 1 - paintSmoothstep(start, 1, distance);
  }
}
