import { afterEach, describe, expect, it } from 'vitest';
import { solidScriptDocumentUses } from '@/solid_script/document/solid_script_document.js';
import { solidScriptEditorCurrentGet } from '@/solid_script/ui/solid_script_editor_open.js';
import { editorFixture, find, tool } from './solid_script_editor_fixture.js';

/** Lets pending promises settle. */
async function settle(): Promise<void> {
  for (let round = 0; round < 10; round++) await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Opens a built-in example by name from the Examples window.
 *
 * @param name Example name.
 */
async function openExample(name: string): Promise<void> {
  tool('Examples…').click();
  await settle();
  type(find<HTMLInputElement>('[data-solid-script-examples] input'), name);
  tool('Open').click();
  await settle();
}

/**
 * Types into an input, replacing its value.
 *
 * @param input Input.
 * @param value Text.
 */
function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

afterEach(() => {
  solidScriptEditorCurrentGet()?.close();
  document.body.replaceChildren();
});

describe('SolidScript editor New uses', () => {
  it('starts a new generator script as a generator only', () => {
    const { script } = editorFixture([{ command: 'sphere' }]);
    tool('New').click();
    expect(script().blocks.map((block) => block.command)).toEqual(['cube']);
    expect(solidScriptDocumentUses(script())).toEqual({ generator: true, modifier: false });
  });

  it('starts a new modifier script as a modifier only', () => {
    const { script } = editorFixture([{ command: 'sphere' }], 'modifier');
    find<HTMLButtonElement>('[role="tab"][data-tab="settings"]').click();
    const generator = find<HTMLInputElement>('[data-solid-script-settings] [data-solid-script-use="generator"]');
    const modifier = find<HTMLInputElement>('[data-solid-script-settings] [data-solid-script-use="modifier"]');
    expect([generator.checked, modifier.checked]).toEqual([true, false]);
    tool('New').click();
    expect(script().blocks.map((block) => block.command)).toEqual(['cube']);
    expect(solidScriptDocumentUses(script())).toEqual({ generator: false, modifier: true });
    expect(find<HTMLInputElement>('[data-solid-script-settings] [data-solid-script-use="generator"]').checked).toBe(
      false,
    );
    expect(find<HTMLInputElement>('[data-solid-script-settings] [data-solid-script-use="modifier"]').checked).toBe(
      true,
    );
  });

  it('opens an example without uses as the host type', async () => {
    const { script } = editorFixture([{ command: 'cube' }], 'modifier');
    await openExample('Torus');
    expect(script().name).toBe('Torus');
    expect(solidScriptDocumentUses(script())).toEqual({ generator: false, modifier: true });
  });

  it('keeps the uses an example already set', async () => {
    const { script } = editorFixture([{ command: 'cube' }], 'modifier');
    await openExample('Pedestal');
    expect(script().name).toBe('Pedestal');
    expect(solidScriptDocumentUses(script())).toEqual({ generator: true, modifier: true });
  });
});
