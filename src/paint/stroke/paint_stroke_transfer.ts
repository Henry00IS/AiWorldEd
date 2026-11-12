import type * as THREE from 'three';
import { paintStrokeBounds } from './paint_stroke_bounds.js';
import type { PaintStrokeLayer } from './paint_stroke_layer.js';

/**
 * Copies the strokes of one layer that can reach a brush-local box into another
 * layer, for pieces cut from a painted brush in the same local space.
 *
 * @param source Source strokes.
 * @param target Receives the strokes.
 * @param bounds Brush-local bounds of the piece.
 */
export function paintStrokesCopyReaching(source: PaintStrokeLayer, target: PaintStrokeLayer, bounds: THREE.Box3): void {
  for (const stroke of source.ordered()) {
    if (paintStrokeBounds(stroke).intersectsBox(bounds)) target.add(stroke);
  }
}
