import type { PaintStroke } from '@/paint/stroke/paint_stroke.js';
import { type PaintStrokeStyle, paintStrokeCreate } from '@/paint/stroke/paint_stroke_style.js';

/** Default style for tests: opaque hard red round paint. */
export const TEST_PAINT_STYLE: PaintStrokeStyle = {
  mode: 'paint',
  shape: 'round',
  stencilTextureId: '',
  stencilScale: 1,
  stampTextureId: '',
  color: 0xff0000,
  opacity: 1,
  hardness: 1,
  radius: 0.1,
};

/**
 * Creates a stroke of dabs pressed straight down onto a floor (+Y faces).
 *
 * @param id Stroke id.
 * @param order Order.
 * @param points Dab centers as [x, y, z].
 * @param style Style overrides.
 * @returns Stroke.
 */
export function testFloorStroke(
  id: string,
  order: number,
  points: readonly (readonly [number, number, number])[],
  style: Partial<PaintStrokeStyle> = {},
): PaintStroke {
  const dabs = new Float32Array(points.length * 10);
  points.forEach(([x, y, z], index) => {
    dabs.set([x, y, z, 0, -1, 0, 0, 0, -1, index % 256], index * 10);
  });
  return paintStrokeCreate(id, order, { ...TEST_PAINT_STYLE, ...style }, dabs);
}
