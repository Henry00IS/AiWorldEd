import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { CommandStack } from '@/commands/command_stack.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { MODIFIER_STACK_SOLID_SCRIPT_KIND } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';
import { ModifierStackFieldRows } from '@/modifier/stack/ui/modifier_stack_field_rows.js';
import { projectFolderCurrentSet } from '@/project/fs/project_folder_current.js';
import { ProjectFileSystemHandle } from '@/project/fs/project_file_system_handle.js';
import { PANEL_PROJECT_PATH_DRAG_TYPE } from '@/project/ui/panel_project_drag.js';
import {
  solidScriptDocumentCreate,
  solidScriptDocumentNormalize,
  solidScriptDocumentUseProblem,
  type SolidScriptDocument,
  type SolidScriptLine,
} from '@/solid_script/document/solid_script_document.js';
import { solidScriptInspectorRow } from '@/solid_script/ui/solid_script_inspector_row.js';
import { solidScriptFileEncode } from '@/solid_script/file/solid_script_file.js';
import { solidScriptEditorCurrentGet } from '@/solid_script/ui/solid_script_editor_open.js';
import { ProjectMockDirectoryHandle } from '../../project/fs/project_mock_directory_handle.js';

/**
 * Renders the inspector rows of a SolidScript generator.
 *
 * @returns Fixture parts.
 */
function rowFixture() {
  const world = new THREE.Group();
  const node = modifierGeneratorNodeCreate(MODIFIER_STACK_SOLID_SCRIPT_KIND);
  world.add(node);
  const stepId = ModifierVolume.read(node).modifiers[0]?.id ?? '';
  const commandStack = new CommandStack(50);
  const kind = modifierStackKindFind(MODIFIER_STACK_SOLID_SCRIPT_KIND);
  if (!kind) throw new Error('Expected the SolidScript kind');
  const parameters = () => kind.normalizeParameters(ModifierVolume.read(node).modifiers[0]?.parameters ?? {});
  const rows = new ModifierStackFieldRows(
    kind.fields,
    () => undefined,
    () => [],
    {},
    (status) => ({
      volume: node,
      stepId,
      commandStack,
      status,
      refresh: () => rows.update(parameters()),
    }),
  );
  document.body.append(rows.getElement());
  rows.update(parameters());
  const field = rows.getElement().querySelector<HTMLElement>('[data-solid-script-field]');
  if (!field) throw new Error('Expected the script row');
  return { node, commandStack, field, rows, script: () => solidScriptDocumentNormalize(parameters()['script']) };
}

/** Uses of a script made to be used as a modifier only. */
const MODIFIER_ONLY = { generator: false, modifier: true };

/** Lets pending promises settle. */
async function settle(): Promise<void> {
  for (let round = 0; round < 10; round++) await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  solidScriptEditorCurrentGet()?.close();
  projectFolderCurrentSet(null);
  document.body.replaceChildren();
});

describe('SolidScript inspector row', () => {
  it('is the first row and shows the script name, its size and its solids', () => {
    const { field, rows } = rowFixture();
    expect(rows.getElement().firstElementChild?.contains(field)).toBe(true);
    expect(field.textContent).toContain('Script');
    expect(field.textContent).toMatch(/2 lines · 2 solids/);
  });

  it('uses an .aiscript file dropped from the project browser as one undo step', async () => {
    const fileSystem = new ProjectFileSystemHandle(new ProjectMockDirectoryHandle('game').asHandle());
    projectFolderCurrentSet(fileSystem);
    const dropped = solidScriptDocumentCreate([{ command: 'cube' }], 'Pillar');
    await fileSystem.fileWrite('Props/Pillar.aiscript', await solidScriptFileEncode(dropped));
    const { field, script, commandStack } = rowFixture();
    const event = new MouseEvent('drop', { bubbles: true, cancelable: true });
    const data: Record<string, string> = { [PANEL_PROJECT_PATH_DRAG_TYPE]: 'Props/Pillar.aiscript' };
    Object.defineProperty(event, 'dataTransfer', {
      value: { types: Object.keys(data), files: [], getData: (kind: string) => data[kind] ?? '' },
    });
    field.dispatchEvent(event);
    await settle();
    expect(script()).toEqual(dropped);
    expect(field.textContent).toContain('Pillar');
    expect(field.textContent).toMatch(/1 line · 1 solid/);
    commandStack.undo();
    expect(script().name).toBe('Script');
  });

  it('refuses other dropped files and opens the editor from Edit Script', async () => {
    const { field } = rowFixture();
    const event = new MouseEvent('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', {
      value: { types: [PANEL_PROJECT_PATH_DRAG_TYPE], files: [], getData: () => 'Textures/brick.png' },
    });
    field.dispatchEvent(event);
    await settle();
    expect(field.textContent).toContain('Only .aiscript files fit here.');
    [...field.querySelectorAll('button')].find((button) => button.textContent === 'Edit Script')?.click();
    await settle();
    expect(document.querySelector('[data-solid-script-editor]')).not.toBeNull();
  });
});

/**
 * Renders a script row for a script and reads its message area.
 *
 * @param script Stored script.
 * @returns Shown messages in DOM order, each with whether it is the error.
 */
function messagesOf(script: SolidScriptDocument): { text: string; error: boolean }[] {
  const row = solidScriptInspectorRow(() => null, 'script', 'scriptInputs', 'generator');
  document.body.append(row.element);
  row.write({ script });
  const area = row.element.querySelector('[data-solid-script-messages]');
  if (!area) throw new Error('Expected the message area');
  return [...area.children]
    .filter((child) => child instanceof HTMLElement && child.style.display !== 'none' && child.textContent !== '')
    .map((child) => ({ text: child.textContent ?? '', error: child.hasAttribute('data-solid-script-error') }));
}

/** A line that stops the script. */
const BROKEN: SolidScriptLine = { command: 'cube', values: { size: 'oak' } };

describe('SolidScript inspector row messages', () => {
  it('shows nothing for a script that runs where it is used', () => {
    expect(messagesOf(solidScriptDocumentCreate([{ command: 'cube' }]))).toEqual([]);
  });

  it('shows only the red error for a script that stops', () => {
    const shown = messagesOf(solidScriptDocumentCreate([BROKEN]));
    expect(shown.map((entry) => entry.error)).toEqual([true]);
  });

  it('shows only the use warning for a script made for another use', () => {
    const script = { ...solidScriptDocumentCreate([{ command: 'cube' }], 'Radial Array'), uses: MODIFIER_ONLY };
    expect(messagesOf(script)).toEqual([{ text: solidScriptDocumentUseProblem(script, 'generator'), error: false }]);
  });

  it('shows the use warning first and the error directly below it', () => {
    const script = { ...solidScriptDocumentCreate([BROKEN], 'Radial Array'), uses: MODIFIER_ONLY };
    const shown = messagesOf(script);
    expect(shown.map((entry) => entry.error)).toEqual([false, true]);
    expect(shown[0]?.text).toBe(solidScriptDocumentUseProblem(script, 'generator'));
  });
});
