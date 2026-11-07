import type { ModifierStackEntry, ModifierStackSettings } from './modifier_stack_types.js';
import { modifierStackKindFind } from './modifier_stack_catalog.js';

/** Most modifiers one volume may hold. */
export const MODIFIER_STACK_MAX_MODIFIERS = 32;

/**
 * Normalizes stored stack settings. Unknown kinds are kept untouched so a scene
 * saved by a newer editor round-trips; they evaluate as pass-through.
 *
 * @param input Stored or partial settings.
 * @returns Complete settings with unique step ids.
 */
export function modifierStackSettingsNormalize(input: Partial<ModifierStackSettings> = {}): ModifierStackSettings {
  const stored = Array.isArray(input.modifiers) ? input.modifiers.slice(0, MODIFIER_STACK_MAX_MODIFIERS) : [];
  const modifiers = input.role === 'generator' ? modifierStackGeneratorFirst(stored) : stored;
  const used = new Set<string>();
  return {
    version: 2,
    enabled: input.enabled !== false,
    grouping: input.grouping === 'brush' ? 'brush' : 'compound',
    excludedIds: modifierStackStringList(input.excludedIds),
    modifiers: modifiers.map((entry) => modifierStackEntryNormalize(entry, used)),
    ...(input.role === 'generator' ? { role: 'generator' as const } : {}),
  };
}

/**
 * Keeps a generator node's generator at the top of its stack, whatever was
 * moved or dropped above it.
 *
 * @param modifiers Stored entries.
 * @returns Entries with the first generator first.
 */
function modifierStackGeneratorFirst(modifiers: readonly Partial<ModifierStackEntry>[]): Partial<ModifierStackEntry>[] {
  const index = modifiers.findIndex((entry) => modifierStackKindFind(String(entry.kind))?.category === 'generate');
  if (index <= 0) return [...modifiers];
  return [modifiers[index]!, ...modifiers.slice(0, index), ...modifiers.slice(index + 1)];
}

/**
 * Creates a new modifier entry with default parameters.
 *
 * @param kind Kind id.
 * @param existing Entries already in the stack, used to pick a unique id and
 *   name.
 * @param fresh True starts from the kind's new-modifier values; false keeps the
 *   values older saves imply, for converting legacy files.
 * @returns Entry.
 */
export function modifierStackEntryCreate(
  kind: string,
  existing: readonly ModifierStackEntry[],
  fresh = true,
): ModifierStackEntry {
  const used = new Set(existing.map((entry) => entry.id));
  const strategy = modifierStackKindFind(kind);
  const label = strategy?.label ?? kind;
  const sameKind = existing.filter((entry) => entry.kind === kind).length;
  const name = sameKind === 0 ? label : `${label} ${sameKind + 1}`;
  const parameters = fresh && strategy ? strategy.createParameters() : {};
  return modifierStackEntryNormalize({ id: '', kind, name, enabled: true, expanded: true, parameters }, used);
}

/**
 * Normalizes one entry and reserves its id.
 *
 * @param input Stored entry.
 * @param used Ids already taken; the new id is added.
 * @returns Entry.
 */
function modifierStackEntryNormalize(input: Partial<ModifierStackEntry>, used: Set<string>): ModifierStackEntry {
  const kind = typeof input.kind === 'string' ? input.kind : '';
  const strategy = modifierStackKindFind(kind);
  const parameters = input.parameters && typeof input.parameters === 'object' ? { ...input.parameters } : {};
  const id = modifierStackEntryId(input.id, used);
  return {
    id,
    kind,
    name: typeof input.name === 'string' && input.name.trim() !== '' ? input.name : (strategy?.label ?? kind),
    enabled: input.enabled !== false,
    expanded: input.expanded !== false,
    parameters: strategy ? strategy.normalizeParameters(parameters) : parameters,
  };
}

/**
 * Keeps a stored id when it is free, otherwise allocates the next free one.
 *
 * @param stored Stored id.
 * @param used Ids already taken; the result is added.
 * @returns Unique id.
 */
function modifierStackEntryId(stored: unknown, used: Set<string>): string {
  let id = typeof stored === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(stored) && !used.has(stored) ? stored : '';
  for (let index = 1; id === ''; index++) if (!used.has(`m${index}`)) id = `m${index}`;
  used.add(id);
  return id;
}

/**
 * Keeps only non-empty, unique strings.
 *
 * @param input Stored list.
 * @returns Clean list.
 */
function modifierStackStringList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter((entry): entry is string => typeof entry === 'string' && entry !== ''))];
}
