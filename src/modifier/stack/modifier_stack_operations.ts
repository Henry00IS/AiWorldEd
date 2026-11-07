import type { ModifierStackEntry, ModifierStackSettings, ModifierStackValue } from './modifier_stack_types.js';
import {
  MODIFIER_STACK_MAX_MODIFIERS,
  modifierStackEntryCreate,
  modifierStackSettingsNormalize,
} from './modifier_stack_settings.js';

/**
 * Returns a stack with one more modifier at the end, unless the stack is full.
 *
 * @param stack Current stack.
 * @param kind Modifier kind id.
 * @returns Next stack.
 */
export function modifierStackAdd(stack: ModifierStackSettings, kind: string): ModifierStackSettings {
  if (stack.modifiers.length >= MODIFIER_STACK_MAX_MODIFIERS) return stack;
  return modifierStackSettingsNormalize({
    ...stack,
    modifiers: [...stack.modifiers, modifierStackEntryCreate(kind, stack.modifiers)],
  });
}

/**
 * Returns a stack without one modifier.
 *
 * @param stack Current stack.
 * @param id Modifier id.
 * @returns Next stack.
 */
export function modifierStackRemove(stack: ModifierStackSettings, id: string): ModifierStackSettings {
  return { ...stack, modifiers: stack.modifiers.filter((entry) => entry.id !== id) };
}

/**
 * Returns a stack with one modifier moved to a new index, clamped to the stack.
 *
 * @param stack Current stack.
 * @param id Modifier id.
 * @param index Target index after removal.
 * @returns Next stack.
 */
export function modifierStackMove(stack: ModifierStackSettings, id: string, index: number): ModifierStackSettings {
  const moving = stack.modifiers.find((entry) => entry.id === id);
  if (!moving) return stack;
  const rest = stack.modifiers.filter((entry) => entry !== moving);
  const target = Math.max(0, Math.min(rest.length, Math.round(index)));
  return { ...stack, modifiers: [...rest.slice(0, target), moving, ...rest.slice(target)] };
}

/**
 * Returns a stack with a copy of one modifier right after it.
 *
 * @param stack Current stack.
 * @param id Modifier id.
 * @returns Next stack.
 */
export function modifierStackDuplicate(stack: ModifierStackSettings, id: string): ModifierStackSettings {
  const index = stack.modifiers.findIndex((entry) => entry.id === id);
  const source = stack.modifiers[index];
  if (!source || stack.modifiers.length >= MODIFIER_STACK_MAX_MODIFIERS) return stack;
  const fresh = modifierStackEntryCreate(source.kind, stack.modifiers);
  const copy: ModifierStackEntry = { ...structuredClone(source), id: fresh.id, name: fresh.name };
  return { ...stack, modifiers: [...stack.modifiers.slice(0, index + 1), copy, ...stack.modifiers.slice(index + 1)] };
}

/**
 * Returns a stack with one modifier's fields patched and re-normalized.
 *
 * @param stack Current stack.
 * @param id Modifier id.
 * @param patch Entry fields to replace.
 * @returns Next stack.
 */
export function modifierStackPatch(
  stack: ModifierStackSettings,
  id: string,
  patch: Partial<Omit<ModifierStackEntry, 'id' | 'kind'>>,
): ModifierStackSettings {
  const modifiers = stack.modifiers.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry));
  return modifierStackSettingsNormalize({ ...stack, modifiers });
}

/**
 * Returns a stack with one modifier parameter changed.
 *
 * @param stack Current stack.
 * @param id Modifier id.
 * @param key Parameter key.
 * @param value New value.
 * @returns Next stack.
 */
export function modifierStackParameterSet(
  stack: ModifierStackSettings,
  id: string,
  key: string,
  value: ModifierStackValue,
): ModifierStackSettings {
  const entry = stack.modifiers.find((candidate) => candidate.id === id);
  if (!entry) return stack;
  return modifierStackPatch(stack, id, { parameters: { ...entry.parameters, [key]: value } });
}
