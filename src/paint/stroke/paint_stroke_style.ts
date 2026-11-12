import type { PaintStroke, PaintStrokeMode } from './paint_stroke.js';
import { paintDabsQuantize } from './paint_stroke_codec.js';

/** Everything about a stroke except its identity, order and dabs. */
export interface PaintStrokeStyle {
  readonly mode: PaintStrokeMode;
  readonly shape: string;
  readonly stencilTextureId: string;
  readonly stencilScale: number;
  readonly stampTextureId: string;
  readonly color: number;
  readonly opacity: number;
  readonly hardness: number;
  readonly radius: number;
}

/**
 * Creates a stroke record with its dabs rounded to saved precision.
 *
 * @param id Stroke id.
 * @param order Per-brush order.
 * @param style Stroke style.
 * @param dabs Packed brush-local dabs.
 * @returns Stroke.
 */
export function paintStrokeCreate(id: string, order: number, style: PaintStrokeStyle, dabs: Float32Array): PaintStroke {
  return {
    id,
    order,
    mode: style.mode,
    shape: style.shape,
    stencilTextureId: style.stencilTextureId,
    stencilScale: style.stencilScale,
    stampTextureId: style.stampTextureId,
    color: style.color,
    opacity: style.opacity,
    hardness: style.hardness,
    radius: style.radius,
    dabs: paintDabsQuantize(dabs),
  };
}
