import { describe, expect, it } from 'vitest';
import {
  modifierStackAdd,
  modifierStackDuplicate,
  modifierStackMove,
  modifierStackParameterSet,
  modifierStackPatch,
  modifierStackRemove,
} from '@/modifier/stack/modifier_stack_operations.js';
import {
  MODIFIER_STACK_MAX_MODIFIERS,
  modifierStackSettingsNormalize,
} from '@/modifier/stack/modifier_stack_settings.js';
import { modifierStackDropMove } from '@/modifier/stack/ui/panel_properties_modifier_stack_section.js';

describe('modifier stack operations', () => {
  it('adds modifiers with unique ids and names', () => {
    const stack = modifierStackAdd(modifierStackAdd(modifierStackSettingsNormalize(), 'bevel'), 'bevel');
    expect(stack.modifiers.map((entry) => entry.id)).toEqual(['m1', 'm2']);
    expect(stack.modifiers.map((entry) => entry.name)).toEqual(['Bevel', 'Bevel 2']);
  });

  it('moves, duplicates, patches and removes', () => {
    let stack = ['stairs', 'bevel', 'mirror'].reduce(
      (current, kind) => modifierStackAdd(current, kind),
      modifierStackSettingsNormalize(),
    );
    stack = modifierStackMove(stack, 'm3', 0);
    expect(stack.modifiers.map((entry) => entry.kind)).toEqual(['mirror', 'stairs', 'bevel']);
    stack = modifierStackDropMove(stack, 'm3', 'm2', true);
    expect(stack.modifiers.map((entry) => entry.kind)).toEqual(['stairs', 'bevel', 'mirror']);
    stack = modifierStackDuplicate(stack, 'm2');
    expect(stack.modifiers.map((entry) => entry.kind)).toEqual(['stairs', 'bevel', 'bevel', 'mirror']);
    expect(new Set(stack.modifiers.map((entry) => entry.id)).size).toBe(4);
    stack = modifierStackPatch(stack, 'm1', { enabled: false, name: 'Steps' });
    expect(stack.modifiers[0]).toMatchObject({ enabled: false, name: 'Steps' });
    stack = modifierStackParameterSet(stack, 'm1', 'count', 1e6);
    expect(stack.modifiers[0]?.parameters['count']).toBe(256);
    stack = modifierStackRemove(stack, 'm1');
    expect(stack.modifiers.map((entry) => entry.kind)).toEqual(['bevel', 'bevel', 'mirror']);
  });

  it('caps the stack length and sanitizes stored junk', () => {
    let stack = modifierStackSettingsNormalize();
    for (let index = 0; index < 40; index++) stack = modifierStackAdd(stack, 'mirror');
    expect(stack.modifiers).toHaveLength(MODIFIER_STACK_MAX_MODIFIERS);
    const junk = modifierStackSettingsNormalize({
      modifiers: [{ id: 'm1' }, { id: 'm1', kind: 'linear' }] as never,
      excludedIds: [1, 'a', 'a'] as never,
      grouping: 'x' as never,
    });
    expect(junk.modifiers.map((entry) => entry.id)).toEqual(['m1', 'm2']);
    expect(junk.excludedIds).toEqual(['a']);
    expect(junk.grouping).toBe('compound');
  });
});
