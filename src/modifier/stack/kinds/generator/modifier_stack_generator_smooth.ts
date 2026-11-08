import type { ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import type { ModifierStackContext } from '@/modifier/stack/evaluate/modifier_stack_context.js';
import type { ModifierSmoothTag } from '@/modifier/smooth/modifier_smooth_shading.js';

/** Smooth shading setting of generators with round parts. */
export const MODIFIER_STACK_GENERATOR_SMOOTH_FIELD: ModifierStackField = {
  key: 'smoothAngle',
  label: 'Smooth shading',
  type: 'number',
  default: 60,
  min: 0,
  max: 180,
  step: 1,
  group: 'Shading',
  hint: 'Curved faces meeting at less than this angle, in degrees, shade smoothly; 0 keeps every face flat. Sharper edges stay hard. On a column, caps and square segments always stay flat.',
};

/**
 * Returns the smoothing of a generator's pieces.
 *
 * @param parameters Normalized parameters.
 * @param context Evaluation context.
 * @param classes Smoothing class per face of the piece, or undefined.
 * @returns Smoothing, or undefined when the pieces stay flat.
 */
export function modifierStackGeneratorSmoothTag(
  parameters: Record<string, unknown>,
  context: ModifierStackContext,
  classes: readonly number[] | undefined,
): ModifierSmoothTag | undefined {
  const maxAngle = Number(parameters['smoothAngle'] ?? 0);
  if (!(maxAngle > 0)) return undefined;
  return { group: `${context.volume.uuid}#${context.step.id}`, maxAngle, classes };
}
