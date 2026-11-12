import type { ModifierStackField, ModifierStackPreset } from '@/modifier/stack/modifier_stack_types.js';

/** What preset helpers need from a modifier kind. */
export interface ModifierStackPresetOwner {
  /** Inspector fields. */
  readonly fields: readonly ModifierStackField[];
  /** Offered presets. */
  readonly presets: readonly ModifierStackPreset[];
  /** Normalizes stored or partial parameters. */
  normalizeParameters(input: Record<string, unknown>): Record<string, unknown>;
}

/**
 * Returns every parameter key that any of the presets sets.
 *
 * @param presets Presets.
 * @returns Keys in first-seen order.
 */
export function modifierStackPresetKeys(presets: readonly ModifierStackPreset[]): string[] {
  return [...new Set(presets.flatMap((preset) => Object.keys(preset.parameters)))];
}

/**
 * Applies a preset: keys any preset sets return to their field defaults, then
 * the preset's own values go on top. Other parameters are kept.
 *
 * @param owner Modifier kind.
 * @param parameters Current parameters.
 * @param preset Preset to apply.
 * @returns Normalized parameters.
 */
export function modifierStackPresetApply(
  owner: ModifierStackPresetOwner,
  parameters: Record<string, unknown>,
  preset: ModifierStackPreset,
): Record<string, unknown> {
  const reset: Record<string, unknown> = {};
  for (const key of modifierStackPresetKeys(owner.presets))
    reset[key] = owner.fields.find((field) => field.key === key)?.default;
  return owner.normalizeParameters({ ...parameters, ...reset, ...preset.parameters });
}

/**
 * Returns the id of the preset the parameters still match.
 *
 * @param owner Modifier kind.
 * @param parameters Current parameters.
 * @returns Preset id, or empty when none matches.
 */
export function modifierStackPresetMatch(owner: ModifierStackPresetOwner, parameters: Record<string, unknown>): string {
  const current = owner.normalizeParameters(parameters);
  const keys = modifierStackPresetKeys(owner.presets);
  const match = owner.presets.find((preset) => {
    const applied = modifierStackPresetApply(owner, current, preset);
    return keys.every((key) => applied[key] === current[key]);
  });
  return match?.id ?? '';
}
