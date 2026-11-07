import type { ModifierStackSettings, ModifierStackValue } from './modifier_stack_types.js';
import { modifierStackSettingsNormalize } from './modifier_stack_settings.js';

/** Defaults the first generator format used where the stack now differs. */
const MODIFIER_STACK_LEGACY_DEFAULTS: Readonly<Record<string, Record<string, ModifierStackValue>>> = {
  linear: { mode: 'fixed', relativeX: 1.5 },
};

/**
 * Converts a saved single-generator volume into a stack holding the equivalent
 * single modifier. Volume-wide capture settings move to the stack.
 *
 * @param input Saved generator settings.
 * @returns Normalized stack.
 */
export function modifierStackFromLegacyGenerator(input: Record<string, unknown>): ModifierStackSettings {
  const kind = typeof input['kind'] === 'string' ? input['kind'] : '';
  const stored = modifierStackLegacyRecord(input['parameters']);
  const parameters = {
    ...(MODIFIER_STACK_LEGACY_DEFAULTS[kind] ?? {}),
    ...stored,
    count: input['count'],
    space: input['space'],
    uv: input['uv'],
  };
  return modifierStackSettingsNormalize({
    enabled: input['enabled'] !== false,
    grouping: input['grouping'] === 'brush' ? 'brush' : 'compound',
    excludedIds: Array.isArray(input['excludedIds']) ? (input['excludedIds'] as string[]) : [],
    modifiers: [{ id: 'm1', kind, name: '', enabled: true, expanded: true, parameters }],
  });
}

/**
 * Narrows an unknown value to a plain record.
 *
 * @param value Candidate value.
 * @returns The record, or an empty one.
 */
function modifierStackLegacyRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
