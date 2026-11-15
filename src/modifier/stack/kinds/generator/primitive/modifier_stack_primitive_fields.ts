import type { ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import { modifierStackNumber } from '@/modifier/stack/modifier_stack_fields.js';

/** Largest side or segment count of a primitive generator. */
export const MODIFIER_STACK_PRIMITIVE_MAX_SIDES = 64;

/**
 * Builds a whole-number resolution field, such as a side or ring count.
 *
 * @param key Parameter key.
 * @param label Caption.
 * @param range Default, minimum and maximum.
 * @param hint Tooltip.
 * @returns Field.
 */
export function modifierStackPrimitiveCountField(
  key: string,
  label: string,
  range: { default: number; min: number; max: number },
  hint: string,
): ModifierStackField {
  return { key, label, type: 'number', integer: true, step: 1, hint, ...range };
}

/**
 * Builds a sweep angle field: how far a shape turns around its axis.
 *
 * @param fallback Default angle in degrees.
 * @param max Largest angle in degrees.
 * @param hint Tooltip.
 * @returns Field.
 */
export function modifierStackPrimitiveSweepField(fallback: number, max: number, hint: string): ModifierStackField {
  return { key: 'sweep', label: 'Sweep Angle', type: 'number', default: fallback, min: 1, max, step: 15, hint };
}

/**
 * Reads a whole-number parameter inside its range.
 *
 * @param parameters Normalized parameters.
 * @param field Field the value belongs to.
 * @returns Rounded, clamped value.
 */
export function modifierStackPrimitiveCount(parameters: Record<string, unknown>, field: ModifierStackField): number {
  return Math.round(modifierStackPrimitiveValue(parameters, field));
}

/**
 * Reads a numeric parameter inside its range.
 *
 * @param parameters Normalized parameters.
 * @param field Field the value belongs to.
 * @returns Clamped value.
 */
export function modifierStackPrimitiveValue(parameters: Record<string, unknown>, field: ModifierStackField): number {
  return modifierStackNumber(parameters[field.key], Number(field.default), field.min, field.max);
}
