import type { PaintShape } from './paint_shape.js';
import { PaintShapeRound } from './paint_shape_round.js';
import { PaintShapeFootprints } from './paint_shape_footprints.js';
import { PaintShapePaw } from './paint_shape_paw.js';
import { PaintShapeSplat } from './paint_shape_splat.js';
import { PaintShapeStar } from './paint_shape_star.js';
import { PaintShapeHeart } from './paint_shape_heart.js';

/** Id of the round brush tip. */
export const PAINT_SHAPE_ROUND_ID = 'round';

/** Every built-in shape in palette order. */
export const paintShapes: readonly PaintShape[] = [
  new PaintShapeRound(),
  new PaintShapeFootprints(),
  new PaintShapePaw(),
  new PaintShapeSplat(),
  new PaintShapeStar(),
  new PaintShapeHeart(),
];

/**
 * Finds a shape by id, falling back to the round tip for unknown ids.
 *
 * @param id Shape id.
 * @returns Shape.
 */
export function paintShapeFind(id: string): PaintShape {
  return paintShapes.find((shape) => shape.id === id) ?? (paintShapes[0] as PaintShape);
}
