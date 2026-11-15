import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { CommandStack } from '@/commands/command_stack.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { MODIFIER_STACK_SOLID_SCRIPT_KIND } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_kind_solid_script.js';
import { modifierStackParametersCommit } from '@/modifier/stack/modifier_stack_parameters_commit.js';
import type { ModifierStackActionTarget } from '@/modifier/stack/modifier_stack_types.js';
import { projectFolderCurrentSet } from '@/project/fs/project_folder_current.js';
import { ProjectFileSystemHandle } from '@/project/fs/project_file_system_handle.js';
import { solidScriptDebugStepLimit } from '@/solid_script/debug/solid_script_debug_steps.js';
import {
  solidScriptDocumentFromSource,
  solidScriptDocumentSource,
} from '@/solid_script/document/solid_script_document_source.js';
import {
  solidScriptDocumentNormalize,
  type SolidScriptDocument,
} from '@/solid_script/document/solid_script_document.js';
import { solidScriptEditorCurrentGet, solidScriptEditorOpen } from '@/solid_script/ui/solid_script_editor_open.js';
import { SOLID_SCRIPT_EDITOR_DRAG_COMMAND } from '@/solid_script/ui/solid_script_editor_palette.js';
import { ProjectMockDirectoryHandle } from '../../project/fs/project_mock_directory_handle.js';

/**
 * Opens the editor of a generator holding a script.
 *
 * @param source Script source, one line per line.
 * @returns Fixture parts.
 */
function editorFixture(source: string) {
  const world = new THREE.Group();
  const node = modifierGeneratorNodeCreate(MODIFIER_STACK_SOLID_SCRIPT_KIND);
  world.add(node);
  const stepId = ModifierVolume.read(node).modifiers[0]?.id ?? '';
  modifierStackParametersCommit(node, stepId, { script: solidScriptDocumentFromSource(source) }, null);
  const commandStack = new CommandStack(50);
  const target: ModifierStackActionTarget = { volume: node, stepId, commandStack, status: () => {} };
  solidScriptEditorOpen(target);
  const root = document.querySelector<HTMLElement>('[data-solid-script-editor]');
  if (!root) throw new Error('Expected the editor window');
  const script = (): SolidScriptDocument =>
    solidScriptDocumentNormalize(ModifierVolume.read(node).modifiers[0]?.parameters['script']);
  return { node, stepId, commandStack, root, script, source: () => solidScriptDocumentSource(script()) };
}

/**
 * Finds an element or fails.
 *
 * @param selector CSS selector.
 * @returns Element.
 */
function find<T extends HTMLElement = HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Expected ${selector}`);
  return element;
}

/**
 * Double-clicks an element.
 *
 * @param element Element.
 */
function doubleClick(element: HTMLElement): void {
  element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
}

/**
 * Types into an input.
 *
 * @param input Input.
 * @param value New text.
 */
function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Returns the toolbar button with a label.
 *
 * @param label Button text.
 * @returns Button.
 */
function tool(label: string): HTMLButtonElement {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) => candidate.textContent === label,
  );
  if (!button) throw new Error(`Expected the ${label} button`);
  return button;
}

/** Lets pending promises settle. */
async function settle(): Promise<void> {
  for (let round = 0; round < 10; round++) await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  solidScriptEditorCurrentGet()?.close();
  projectFolderCurrentSet(null);
  document.body.replaceChildren();
});

describe('SolidScript editor', () => {
  it('lists the commands by category, without the End line', () => {
    const { root } = editorFixture('cube(1);');
    const captions = [...root.querySelectorAll('.solid-script-editor-palette-caption')].map(
      (caption) => caption.textContent,
    );
    expect(captions).toEqual(['Solids', '2D Shapes', 'Transforms', 'Combine', 'Logic']);
    expect(root.querySelector('[data-command="cylinder"].solid-script-editor-palette-item')).not.toBeNull();
    expect(root.querySelector('[data-command="end"].solid-script-editor-palette-item')).toBeNull();
  });

  it('inserts a double-clicked command below the caret after configuring it, as one undo step', () => {
    const { root, commandStack, source } = editorFixture('cube(1);\nsphere(1);');
    find<HTMLInputElement>('[data-line="0"] input').focus();
    doubleClick(find('.solid-script-editor-palette-item[data-command="cylinder"]'));
    type(find<HTMLInputElement>('[data-solid-script-configurator="cylinder"] input[aria-label="Height"]'), '5');
    expect(find('.solid-script-editor-preview').textContent).toBe('cylinder(h = 5, r1 = 1, r2 = 1, center = false);');
    tool('OK').click();
    expect(source()).toBe('cube(1);\ncylinder(h = 5, r1 = 1, r2 = 1, center = false);\nsphere(1);');
    expect(root.querySelector('[data-line="1"] .solid-script-editor-chip')?.textContent).toContain('Cylinder');
    commandStack.undo();
    expect(source()).toBe('cube(1);\nsphere(1);');
    expect(root.querySelectorAll('.solid-script-editor-row')).toHaveLength(2);
  });

  it('reuses a blank caret line and closes a block command with an End line', () => {
    const { source } = editorFixture('cube(1);\n   \nsphere(1);');
    find<HTMLInputElement>('[data-line="1"] input').focus();
    doubleClick(find('.solid-script-editor-palette-item[data-command="union"]'));
    expect(source()).toBe('cube(1);\nunion() {\n}\nsphere(1);');
    expect(find('[data-line="2"] .solid-script-editor-chip').textContent).toContain('End Union');
  });

  it('drops a dragged command where it lands, and cancelling the configurator inserts nothing', () => {
    const { source } = editorFixture('cube(1);');
    const drop = (): void => {
      const event = new MouseEvent('drop', { bubbles: true, cancelable: true, clientY: -1 });
      const data: Record<string, string> = { [SOLID_SCRIPT_EDITOR_DRAG_COMMAND]: 'sphere' };
      Object.defineProperty(event, 'dataTransfer', {
        value: { types: Object.keys(data), getData: (kind: string) => data[kind] ?? '' },
      });
      find('[data-line="0"] .solid-script-editor-chip, [data-line="0"] input').dispatchEvent(event);
    };
    drop();
    tool('Cancel').click();
    expect(source()).toBe('cube(1);');
    drop();
    type(find<HTMLInputElement>('[data-solid-script-configurator="sphere"] input'), '2');
    tool('OK').click();
    expect(source()).toBe('sphere(r = 2);\ncube(1);');
  });

  it('reopens the configurator of a command line on double-click', () => {
    const { script, source } = editorFixture('');
    doubleClick(find('.solid-script-editor-palette-item[data-command="translate"]'));
    tool('OK').click();
    expect(script().blocks.map((block) => block.type)).toEqual(['command', 'command']);
    doubleClick(find('[data-line="0"] .solid-script-editor-chip'));
    const fields = document.querySelectorAll<HTMLInputElement>('[data-solid-script-configurator="translate"] input');
    expect([...fields].map((input) => input.value)).toEqual(['0', '0', '1']);
    type(fields[2] as HTMLInputElement, '3');
    tool('OK').click();
    expect(source()).toBe('translate(v = [0, 0, 3]) {\n}');
  });

  it('stores typed code, splits lines on Enter and shows errors with their line', () => {
    const { root, source } = editorFixture('cube(1);');
    const input = find<HTMLInputElement>('[data-line="0"] input');
    input.focus();
    type(input, 'cube(2);sphere(');
    input.setSelectionRange(8, 8);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(source()).toBe('cube(2);\nsphere(');
    expect(root.querySelector('.solid-script-editor-output')?.textContent).toMatch(/^Line 2/);
    expect(root.querySelector('[data-line="1"]')?.classList.contains('solid-script-editor-failed')).toBe(true);
  });

  it('steps through the solids, highlights the line being built and stops', () => {
    const { root, node, stepId } = editorFixture('cube(1);\ntranslate([0, 0, 2])\nsphere(1);');
    tool('Step').click();
    expect(solidScriptDebugStepLimit(node, stepId)).toBe(1);
    expect(root.querySelector('.solid-script-editor-stepped')?.getAttribute('data-line')).toBe('0');
    tool('Step').click();
    expect(root.querySelector('.solid-script-editor-stepped')?.getAttribute('data-line')).toBe('2');
    expect(root.textContent).toContain('Step 2 of 2');
    tool('Stop').click();
    expect(solidScriptDebugStepLimit(node, stepId)).toBeUndefined();
    expect(root.querySelector('.solid-script-editor-stepped')).toBeNull();
  });

  it('saves the script into the project and loads it back', async () => {
    const folder = new ProjectMockDirectoryHandle('game');
    projectFolderCurrentSet(new ProjectFileSystemHandle(folder.asHandle()));
    const { node, stepId, source } = editorFixture('cube(4);');
    tool('Save…').click();
    await settle();
    type(find<HTMLInputElement>('[data-solid-script-file-dialog="save"] input'), 'Block');
    tool('Save').click();
    await settle();
    expect(folder.handleAt('AiWorldEd/Scripts/Block.aiscript')).toBeTruthy();
    modifierStackParametersCommit(node, stepId, { script: solidScriptDocumentFromSource('sphere(1);') }, null);
    tool('Load…').click();
    await settle();
    find('[data-solid-script-file="Block.aiscript"]').click();
    tool('Load').click();
    await settle();
    expect(source()).toBe('cube(4);');
  });
});
