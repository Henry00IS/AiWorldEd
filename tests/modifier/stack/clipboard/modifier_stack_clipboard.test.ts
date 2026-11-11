import { describe, it, expect } from 'vitest';
import {
  modifierStackClipboardCopy,
  modifierStackClipboardPaste,
  modifierStackClipboardSettingsCopy,
  modifierStackClipboardSettingsPaste,
} from '@/modifier/stack/clipboard/modifier_stack_clipboard.js';
import {
  MODIFIER_STACK_MAX_MODIFIERS,
  modifierStackSettingsNormalize,
} from '@/modifier/stack/modifier_stack_settings.js';
import { stackFixtureEntries } from '../modifier_stack_fixture.js';

describe('modifier stack clipboard', () => {
  it('copies modifiers without generators and appends them with fresh ids', () => {
    const source = modifierStackSettingsNormalize({
      role: 'generator',
      modifiers: stackFixtureEntries(['column', { kind: 'mirror', parameters: { axis: 'z' } }, 'bevel']),
    });
    const copied = modifierStackClipboardCopy(source);
    expect(copied.modifiers.map((entry) => entry.kind)).toEqual(['mirror', 'bevel']);
    const target = modifierStackSettingsNormalize({ modifiers: stackFixtureEntries(['mirror']) });
    const { stack, skipped } = modifierStackClipboardPaste(target, copied);
    expect(skipped).toBe(0);
    expect(stack.modifiers.map((entry) => entry.kind)).toEqual(['mirror', 'mirror', 'bevel']);
    expect(new Set(stack.modifiers.map((entry) => entry.id)).size).toBe(3);
    expect(stack.modifiers[1]?.name).toBe('Mirror 2');
    expect(stack.modifiers[1]?.parameters['axis']).toBe('z');
  });

  it('leaves out generators, unknown kinds and entries past the limit', () => {
    const generator = stackFixtureEntries(['column'])[0];
    if (!generator) throw new Error('fixture missing');
    const unknown = { ...generator, id: 'x', kind: 'from-the-future' };
    const empty = modifierStackSettingsNormalize({});
    expect(modifierStackClipboardPaste(empty, { modifiers: [generator, unknown] })).toEqual({
      stack: empty,
      skipped: 2,
    });
    const full = modifierStackSettingsNormalize({
      modifiers: stackFixtureEntries(Array.from({ length: MODIFIER_STACK_MAX_MODIFIERS }, () => 'mirror')),
    });
    const copied = modifierStackClipboardCopy(full, [full.modifiers[0]?.id ?? '']);
    expect(copied.modifiers).toHaveLength(1);
    expect(modifierStackClipboardPaste(full, copied).skipped).toBe(1);
  });

  it('pastes generator settings only onto the same generator kind', () => {
    const [column, other] = stackFixtureEntries([{ kind: 'column', parameters: { sides: '16' } }, 'column']);
    if (!column || !other) throw new Error('fixture missing');
    const settings = modifierStackClipboardSettingsCopy(column);
    const target = modifierStackSettingsNormalize({ role: 'generator', modifiers: [other] });
    const id = target.modifiers[0]?.id ?? '';
    const next = modifierStackClipboardSettingsPaste(target, id, settings);
    expect(next?.modifiers[0]?.parameters['sides']).toBe('16');
    expect(next?.modifiers[0]?.id).toBe(id);
    expect(modifierStackClipboardSettingsPaste(target, id, { ...settings, kind: 'stairs' })).toBeNull();
  });
});
