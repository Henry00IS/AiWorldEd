import type { ModifierStackChoice, ModifierStackField, ModifierStackValue } from './modifier_stack_types.js';

/**
 * Clamps a finite number, falling back when the input is not one.
 *
 * @param value Candidate value.
 * @param fallback Value used for missing, NaN, or infinite input.
 * @param min Inclusive minimum.
 * @param max Inclusive maximum.
 * @returns Clamped number.
 */
export function modifierStackNumber(value: unknown, fallback: number, min = -100000, max = 100000): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, numeric));
}

/**
 * Normalizes one field value.
 *
 * @param field Field contract.
 * @param value Stored value.
 * @returns Valid value for the field.
 */
export function modifierStackFieldValue(field: ModifierStackField, value: unknown): ModifierStackValue {
  if (field.type === 'boolean') return typeof value === 'boolean' ? value : field.default;
  if (field.type === 'choice') return modifierStackChoiceValue(field, value);
  const numeric = modifierStackNumber(value, Number(field.default), field.min, field.max);
  return field.integer ? Math.round(numeric) : numeric;
}

/**
 * Normalizes a parameter record against a field list, keeping no unknown keys.
 *
 * @param fields Field contracts.
 * @param input Stored parameters.
 * @returns Complete, valid parameters.
 */
export function modifierStackFieldsNormalize(
  fields: readonly ModifierStackField[],
  input: Record<string, unknown>,
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const field of fields) output[field.key] = modifierStackFieldValue(field, input[field.key]);
  return output;
}

/**
 * Builds a labeled choice list.
 *
 * @param entries Pairs of stored value and visible label.
 * @returns Choices.
 */
export function modifierStackChoices(entries: readonly (readonly [string, string])[]): ModifierStackChoice[] {
  return entries.map(([value, label]) => ({ value, label }));
}

/**
 * Builds three X/Y/Z number fields sharing a key prefix.
 *
 * @param prefix Key stem; the axis letter is appended.
 * @param label Caption stem.
 * @param defaults Default X, Y, Z values.
 * @param extra Shared field properties such as group or visibility.
 * @returns Three number fields.
 */
export function modifierStackVectorFields(
  prefix: string,
  label: string,
  defaults: readonly number[],
  extra: Partial<ModifierStackField> = {},
): ModifierStackField[] {
  return ['X', 'Y', 'Z'].map((axis, index) => ({
    key: prefix + axis,
    label: `${label} ${axis}`,
    type: 'number',
    default: defaults[index] ?? 0,
    step: 0.25,
    ...extra,
  }));
}

/**
 * Returns a visibility predicate that matches one parameter value.
 *
 * @param key Parameter key.
 * @param values Values for which the field is shown.
 * @returns Visibility predicate.
 */
export function modifierStackWhen(
  key: string,
  ...values: ModifierStackValue[]
): (p: Record<string, unknown>) => boolean {
  return (parameters) => values.includes(parameters[key] as ModifierStackValue);
}

/**
 * Picks a valid choice.
 *
 * @param field Choice field.
 * @param value Stored value.
 * @returns Stored value when allowed, otherwise the default.
 */
function modifierStackChoiceValue(field: ModifierStackField, value: unknown): ModifierStackValue {
  const allowed = field.choices?.some((choice) => choice.value === value) ?? false;
  return allowed && typeof value === 'string' ? value : field.default;
}
