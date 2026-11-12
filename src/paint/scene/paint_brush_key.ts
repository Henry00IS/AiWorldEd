import type { SolidModel } from '@/solid/model/solid_model.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';

/**
 * Returns the atlas key of a brush. Brush ids are only unique inside one model,
 * so the key also names the model.
 *
 * @param model Owning model.
 * @param brush Brush.
 * @returns Key.
 */
export function paintBrushKey(model: SolidModel, brush: SolidBrushInstance): string {
  return `${model.root.uuid}/${brush.id}`;
}
