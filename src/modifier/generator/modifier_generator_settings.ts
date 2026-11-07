import { generatorKindFind } from './modifier_generator_catalog.js';
import type { GeneratorField, GeneratorSettings, GeneratorValue } from './modifier_generator_types.js';

/**
 * Clamps finite numeric settings. @param value Input. @param fallback Missing
 * value. @param min Minimum. @param max Maximum.
 */
export function generatorNumber(value: unknown, fallback: number, min = -100000, max = 100000): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}
/**
 * Normalizes one strategy property. @param field Property contract. @param
 * value Saved value.
 */
function generatorFieldValue(field: GeneratorField, value: unknown): GeneratorValue {
  if (field.type === 'number') return generatorNumber(value, Number(field.default), field.min, field.max);
  if (field.type === 'boolean') return typeof value === 'boolean' ? value : field.default;
  return typeof value === 'string' && field.choices?.includes(value) ? value : field.default;
}
/**
 * Normalizes imported settings without inventing generator references. @param
 * input Saved data.
 */
export function generatorSettingsNormalize(input: Partial<GeneratorSettings> = {}): GeneratorSettings {
  const kind = typeof input.kind === 'string' ? input.kind : '';
  const strategy = generatorKindFind(kind);
  const parameters = { ...input.parameters };
  for (const field of strategy?.fields ?? []) parameters[field.key] = generatorFieldValue(field, parameters[field.key]);
  return {
    version: 1,
    kind,
    enabled: input.enabled !== false,
    count: strategy?.count ?? Math.round(generatorNumber(input.count, 3, 1, 128)),
    space: input.space === 'world' ? 'world' : 'volume',
    grouping: input.grouping === 'brush' ? 'brush' : 'compound',
    uv: input.uv === 'world' ? 'world' : 'copied',
    excludedIds: Array.isArray(input.excludedIds)
      ? input.excludedIds.filter((id): id is string => typeof id === 'string')
      : [],
    parameters,
  };
}
