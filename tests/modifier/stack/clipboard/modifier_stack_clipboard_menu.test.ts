import { afterEach, describe, expect, it } from 'vitest';
import { clipboardStore } from '@/clipboard/clipboard_store.js';
import type { ModifierStackSettings } from '@/modifier/stack/modifier_stack_types.js';
import { modifierStackSettingsNormalize } from '@/modifier/stack/modifier_stack_settings.js';
import { modifierStackClipboardCardItems } from '@/modifier/stack/ui/modifier_stack_clipboard_menu.js';
import { stackFixtureEntries } from '../modifier_stack_fixture.js';

/**
 * Builds a panel host over a stack that records its undoable edits.
 *
 * @param stack Starting stack.
 * @returns Host, its edits and notices, and the live stack.
 */
function host(stack: ModifierStackSettings) {
  let current = stack;
  const edits: ModifierStackSettings[] = [];
  const notices: string[] = [];
  return {
    host: {
      read: () => current,
      edit: (change: (value: ModifierStackSettings) => ModifierStackSettings) => {
        current = change(current);
        edits.push(current);
      },
      notice: (text: string) => notices.push(text),
    },
    edits,
    notices,
    stack: () => current,
  };
}

/**
 * Runs one card menu entry and lets its clipboard read settle.
 *
 * @param items Menu items.
 * @param label Entry label.
 */
async function run(items: ReturnType<typeof modifierStackClipboardCardItems>, label: string): Promise<void> {
  const item = items.find((candidate) => 'label' in candidate && candidate.label === label);
  if (!item || !('callback' in item) || !item.callback) throw new Error(`No ${label}`);
  item.callback();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Returns whether a card menu entry is disabled.
 *
 * @param items Menu items.
 * @param label Entry label.
 * @returns True when disabled.
 */
function disabled(items: ReturnType<typeof modifierStackClipboardCardItems>, label: string): boolean {
  const item = items.find((candidate) => 'label' in candidate && candidate.label === label);
  return !!item && 'disabled' in item && item.disabled === true;
}

describe('modifier card Copy and Paste settings', () => {
  afterEach(() => clipboardStore.clear());

  it('pastes a copied modifier onto another of the same kind as one edit, keeping its id and name', async () => {
    const source = host(
      modifierStackSettingsNormalize({
        modifiers: stackFixtureEntries([{ kind: 'mirror', parameters: { axis: 'z' } }]),
      }),
    );
    const target = host(modifierStackSettingsNormalize({ modifiers: stackFixtureEntries(['bevel', 'mirror']) }));
    const [bevel, mirror] = target.stack().modifiers;
    if (!bevel || !mirror) throw new Error('fixture missing');
    await run(modifierStackClipboardCardItems(source.host, source.stack().modifiers[0]!), 'Copy');
    expect(disabled(modifierStackClipboardCardItems(target.host, mirror), 'Paste Settings')).toBe(false);
    expect(disabled(modifierStackClipboardCardItems(target.host, bevel), 'Paste Settings')).toBe(true);
    await run(modifierStackClipboardCardItems(target.host, mirror), 'Paste Settings');
    expect(target.edits).toHaveLength(1);
    const pasted = target.stack().modifiers[1];
    expect(pasted?.parameters['axis']).toBe('z');
    expect(pasted?.id).toBe(mirror.id);
    expect(pasted?.name).toBe(mirror.name);
    expect(target.stack().modifiers[0]).toEqual(bevel);
  });

  it('lets a generator Copy feed Paste settings of another generator of its kind', async () => {
    const source = host(
      modifierStackSettingsNormalize({
        role: 'generator',
        modifiers: stackFixtureEntries([{ kind: 'column', parameters: { sides: '16' } }]),
      }),
    );
    const target = host(
      modifierStackSettingsNormalize({ role: 'generator', modifiers: stackFixtureEntries(['column']) }),
    );
    const items = modifierStackClipboardCardItems(source.host, source.stack().modifiers[0]!);
    expect(items.map((item) => ('label' in item ? item.label : ''))).toEqual(['Copy', 'Paste Settings']);
    await run(items, 'Copy');
    await run(modifierStackClipboardCardItems(target.host, target.stack().modifiers[0]!), 'Paste Settings');
    expect(target.edits).toHaveLength(1);
    expect(target.stack().modifiers[0]?.parameters['sides']).toBe('16');
  });

  it('still pastes settings copied by older editors and explains a kind mismatch', async () => {
    const target = host(
      modifierStackSettingsNormalize({ role: 'generator', modifiers: stackFixtureEntries(['column']) }),
    );
    await clipboardStore.write('generator-settings', { kind: 'column', parameters: { sides: '12' } });
    await run(modifierStackClipboardCardItems(target.host, target.stack().modifiers[0]!), 'Paste Settings');
    expect(target.stack().modifiers[0]?.parameters['sides']).toBe('12');
    await clipboardStore.write('modifiers', { modifiers: stackFixtureEntries(['bevel']) });
    await run(modifierStackClipboardCardItems(target.host, target.stack().modifiers[0]!), 'Paste Settings');
    expect(target.edits).toHaveLength(1);
    expect(target.notices.at(-1)).toMatch(/Nothing to paste/);
  });
});
