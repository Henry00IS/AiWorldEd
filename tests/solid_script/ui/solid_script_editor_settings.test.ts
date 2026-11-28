import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { CommandStack } from '@/commands/command_stack.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { MODIFIER_STACK_SOLID_SCRIPT_KIND } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';
import { modifierStackParametersCommit } from '@/modifier/stack/modifier_stack_parameters_commit.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import type { ModifierStackActionTarget } from '@/modifier/stack/modifier_stack_types.js';
import {
  solidScriptDocumentNormalize,
  type SolidScriptDocument,
} from '@/solid_script/document/solid_script_document.js';
import { solidScriptFileDecode, solidScriptFileEncode } from '@/solid_script/file/solid_script_file.js';
import { solidScriptEditorCurrentGet, solidScriptEditorOpen } from '@/solid_script/ui/solid_script_editor_open.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from '@/solid_script/ui/solid_script_editor_css.js';
import { SOLID_SCRIPT_EDITOR_VIEW_LABELS } from '@/solid_script/ui/solid_script_editor_view.js';
import { editorFixture, find } from './solid_script_editor_fixture.js';

afterEach(() => {
  solidScriptEditorCurrentGet()?.close();
  document.body.replaceChildren();
});

describe('Solid Script editor Settings list', () => {
  it('shows Version, Can Be Used As and Has Edit Mode as one vertical list', () => {
    editorFixture([{ command: 'cube' }]);
    find<HTMLButtonElement>('[role="tab"][data-tab="settings"]').click();
    const list = find<HTMLElement>('[data-solid-script-settings-list]');
    expect(list.style.display).toBe('grid');
    const version = find<HTMLSelectElement>('[data-solid-script-settings] select[aria-label="Version"]');
    const boxes = [...list.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    expect(list.querySelector('select')).toBe(version);
    expect([...list.querySelectorAll('select, input[type="checkbox"]')]).toEqual([version, ...boxes]);
    expect(boxes.map((box) => box.getAttribute('aria-label'))).toEqual([
      'Can Be Used As Generator',
      'Can Be Used As Modifier',
      'Has Edit Mode',
    ]);
    expect(boxes.map((box) => box.closest('label')?.textContent?.trim())).toEqual([
      'Can Be Used As Generator',
      'Can Be Used As Modifier',
      'Has Edit Mode',
    ]);
    expect([...list.querySelectorAll('span')].map((span) => span.textContent)).not.toContain('Can Be Used As');
  });

  it('draws every Settings option with the same row class, in the editor font, not muted monospace', () => {
    editorFixture([{ command: 'cube' }]);
    find<HTMLButtonElement>('[role="tab"][data-tab="settings"]').click();
    const option = SOLID_SCRIPT_EDITOR_CLASSES.settingsOption;
    const settings = find('[data-solid-script-settings]');
    const checkboxes = [...settings.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    expect(checkboxes.map((box) => box.getAttribute('aria-label'))).toEqual([
      'Can Be Used As Generator',
      'Can Be Used As Modifier',
      'Has Edit Mode',
      ...SOLID_SCRIPT_EDITOR_VIEW_LABELS.map((entry) => entry[1]),
    ]);
    for (const box of checkboxes) {
      const row = box.closest('label');
      expect(row?.classList.contains(option), box.getAttribute('aria-label') ?? '').toBe(true);
      expect(row?.querySelector('span'), box.getAttribute('aria-label') ?? '').toBeNull();
      expect(row?.style.fontFamily, box.getAttribute('aria-label') ?? '').toBe('');
    }
    for (const name of ['Version', 'Author', 'Debug Speed']) {
      const control = find(`[data-solid-script-settings] [aria-label="${name}"]`);
      const row = control.closest('label');
      expect(row?.classList.contains(option), name).toBe(true);
      const text = [...(row?.childNodes ?? [])].some(
        (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').includes(name),
      );
      expect(text, name).toBe(true);
      expect(
        [...(row?.querySelectorAll('span') ?? [])].some((span) => span.style.fontFamily === 'monospace'),
        name,
      ).toBe(false);
    }
  });

  it('defaults the Version menu to Solid Script 1, its only option', () => {
    const { script } = editorFixture([{ command: 'cube' }]);
    find<HTMLButtonElement>('[role="tab"][data-tab="settings"]').click();
    const version = find<HTMLSelectElement>('[data-solid-script-settings] select[aria-label="Version"]');
    expect(script().version).toBe(1);
    expect([...version.options].map((option) => option.textContent)).toEqual(['Solid Script 1']);
    expect(version.selectedOptions[0]?.textContent).toBe('Solid Script 1');
    expect(version.value).toBe('1');
    version.dispatchEvent(new Event('change'));
    expect(script().version).toBe(1);
  });

  it('loads a script with no version as Solid Script 1', () => {
    const { script } = editorWithStoredScript({
      name: 'Legacy',
      blocks: [{ id: 'a1b2c3d4', command: 'cube', values: {} }],
    });
    find<HTMLButtonElement>('[role="tab"][data-tab="settings"]').click();
    const version = find<HTMLSelectElement>('[data-solid-script-settings] select[aria-label="Version"]');
    expect(script().version).toBe(1);
    expect(version.selectedOptions[0]?.textContent).toBe('Solid Script 1');
  });

  it('keeps Solid Script 1 when the script is saved to a file and loaded again', async () => {
    const { script } = editorFixture([{ command: 'cube' }]);
    const loaded = await solidScriptFileDecode(await solidScriptFileEncode(script()));
    expect(loaded.version).toBe(1);
    solidScriptEditorCurrentGet()?.close();
    document.body.replaceChildren();
    const { script: reopened } = editorWithStoredScript(loaded);
    find<HTMLButtonElement>('[role="tab"][data-tab="settings"]').click();
    const version = find<HTMLSelectElement>('[data-solid-script-settings] select[aria-label="Version"]');
    expect(reopened().version).toBe(1);
    expect(version.selectedOptions[0]?.textContent).toBe('Solid Script 1');
  });
});

/**
 * Opens the editor on a stored script value, including scripts with no version.
 *
 * @param stored Stored script, which may omit version.
 * @returns Script reader.
 */
function editorWithStoredScript(stored: unknown): { script: () => SolidScriptDocument } {
  const node = modifierGeneratorNodeCreate(MODIFIER_STACK_SOLID_SCRIPT_KIND);
  new THREE.Group().add(node);
  const stepId = ModifierVolume.read(node).modifiers[0]?.id ?? '';
  modifierStackParametersCommit(node, stepId, { script: stored }, null);
  const target: ModifierStackActionTarget = {
    volume: node,
    stepId,
    commandStack: new CommandStack(50),
    status: () => {},
    refresh: () => {},
  };
  solidScriptEditorOpen(target);
  if (!document.querySelector('[data-solid-script-editor]')) throw new Error('Expected the editor window');
  const script = (): SolidScriptDocument =>
    solidScriptDocumentNormalize(ModifierVolume.read(node).modifiers[0]?.parameters['script']);
  return { script };
}
