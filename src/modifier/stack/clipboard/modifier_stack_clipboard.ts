import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { modifierStackPatch } from '@/modifier/stack/modifier_stack_operations.js';
import {
  MODIFIER_STACK_MAX_MODIFIERS,
  modifierStackEntryCreate,
  modifierStackSettingsNormalize,
} from '@/modifier/stack/modifier_stack_settings.js';
import type { ModifierStackEntry, ModifierStackSettings } from '@/modifier/stack/modifier_stack_types.js';

/** Modifiers on the clipboard. */
export interface ModifierStackClipboardModifiers {
  /** Copied entries in stack order. */
  modifiers: ModifierStackEntry[];
}

/** A modifier's or generator's settings: what Paste settings applies. */
export interface ModifierStackClipboardSettings {
  /** Generator kind the settings belong to. */
  kind: string;
  /** Generator parameters. */
  parameters: Record<string, unknown>;
}

/**
 * Returns whether an entry can be pasted onto a volume: a known modifier kind,
 * not a generator such as Column.
 *
 * @param entry Candidate entry.
 * @returns True when it pastes.
 */
export function modifierStackClipboardPasteable(entry: ModifierStackEntry): boolean {
  const kind = modifierStackKindFind(String(entry.kind));
  return !!kind && kind.category !== 'generate';
}

/**
 * Copies modifiers of a stack, leaving generators out.
 *
 * @param stack Current stack.
 * @param ids Modifier ids, or every modifier when left out.
 * @returns Clipboard data.
 */
export function modifierStackClipboardCopy(
  stack: ModifierStackSettings,
  ids?: readonly string[],
): ModifierStackClipboardModifiers {
  const picked = stack.modifiers.filter((entry) => !ids || ids.includes(entry.id));
  return { modifiers: structuredClone(picked.filter(modifierStackClipboardPasteable)) };
}

/**
 * Appends copied modifiers with fresh ids, keeping their names unless taken.
 * Generators, unknown kinds and entries past the modifier limit are left out.
 *
 * @param stack Current stack.
 * @param data Clipboard data.
 * @returns Next stack and how many entries were left out.
 */
export function modifierStackClipboardPaste(
  stack: ModifierStackSettings,
  data: ModifierStackClipboardModifiers,
): { stack: ModifierStackSettings; skipped: number } {
  const copied = Array.isArray(data.modifiers) ? data.modifiers : [];
  const modifiers = [...stack.modifiers];
  for (const entry of copied.filter(modifierStackClipboardPasteable)) {
    if (modifiers.length >= MODIFIER_STACK_MAX_MODIFIERS) break;
    const fresh = modifierStackEntryCreate(entry.kind, modifiers);
    const name = modifiers.some((other) => other.name === entry.name) ? fresh.name : entry.name;
    modifiers.push({ ...structuredClone(entry), id: fresh.id, name });
  }
  const next = modifierStackSettingsNormalize({ ...stack, modifiers });
  return { stack: next, skipped: copied.length - (next.modifiers.length - stack.modifiers.length) };
}

/**
 * Copies one generator's settings.
 *
 * @param entry Generator entry.
 * @returns Clipboard data.
 */
export function modifierStackClipboardSettingsCopy(entry: ModifierStackEntry): ModifierStackClipboardSettings {
  return { kind: entry.kind, parameters: structuredClone(entry.parameters) };
}

/**
 * Picks the copied modifier whose settings fit an entry: the first of the same
 * kind.
 *
 * @param data Copied modifiers.
 * @param kind Target kind.
 * @returns Its settings, or null when none matches.
 */
export function modifierStackClipboardSettingsOf(
  data: ModifierStackClipboardModifiers | null,
  kind: string,
): ModifierStackClipboardSettings | null {
  const match = Array.isArray(data?.modifiers) ? data.modifiers.find((entry) => entry?.kind === kind) : undefined;
  return match ? modifierStackClipboardSettingsCopy(match) : null;
}

/**
 * Overrides a modifier's or generator's fields with copied settings of the same
 * kind.
 *
 * @param stack Current stack.
 * @param id Generator entry id.
 * @param data Clipboard data.
 * @returns Next stack, or null when the kinds differ.
 */
export function modifierStackClipboardSettingsPaste(
  stack: ModifierStackSettings,
  id: string,
  data: ModifierStackClipboardSettings,
): ModifierStackSettings | null {
  const entry = stack.modifiers.find((candidate) => candidate.id === id);
  if (!entry || entry.kind !== data.kind || !data.parameters || typeof data.parameters !== 'object') return null;
  return modifierStackPatch(stack, id, { parameters: structuredClone(data.parameters) });
}
