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
import { PANEL_PROJECT_PATH_DRAG_TYPE } from '@/project/ui/panel_project_drag.js';
import { solidScriptDebugStepLimit } from '@/solid_script/debug/solid_script_debug_steps.js';
import { solidScriptDocumentSource } from '@/solid_script/document/solid_script_document_source.js';
import {
  solidScriptDocumentCreate,
  solidScriptDocumentNormalize,
  type SolidScriptDocument,
  type SolidScriptLine,
} from '@/solid_script/document/solid_script_document.js';
import { solidScriptFileEncode } from '@/solid_script/file/solid_script_file.js';
import { solidScriptEditorCurrentGet, solidScriptEditorOpen } from '@/solid_script/ui/solid_script_editor_open.js';
import { SOLID_SCRIPT_EDITOR_DRAG_COMMAND } from '@/solid_script/ui/solid_script_editor_palette.js';
import { ProjectMockDirectoryHandle } from '../../project/fs/project_mock_directory_handle.js';

/** Lines of a script with a cube and a sphere. */
const CUBE_SPHERE: SolidScriptLine[] = [{ command: 'cube' }, { command: 'sphere' }];

/**
 * Opens the editor of a generator holding a script.
 *
 * @param lines Command lines of the script.
 * @returns Fixture parts.
 */
function editorFixture(lines: SolidScriptLine[]) {
  const world = new THREE.Group();
  const node = modifierGeneratorNodeCreate(MODIFIER_STACK_SOLID_SCRIPT_KIND);
  world.add(node);
  const stepId = ModifierVolume.read(node).modifiers[0]?.id ?? '';
  modifierStackParametersCommit(node, stepId, { script: solidScriptDocumentCreate(lines, 'Test Script') }, null);
  const commandStack = new CommandStack(50);
  const target: ModifierStackActionTarget = { volume: node, stepId, commandStack, status: () => {} };
  solidScriptEditorOpen(target);
  const root = document.querySelector<HTMLElement>('[data-solid-script-editor]');
  if (!root) throw new Error('Expected the editor window');
  const script = (): SolidScriptDocument =>
    solidScriptDocumentNormalize(ModifierVolume.read(node).modifiers[0]?.parameters['script']);
  const commands = (): string[] => script().blocks.map((block) => block.command);
  return { node, stepId, commandStack, root, script, commands, source: () => solidScriptDocumentSource(script()) };
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
 * Returns the command line of a script line.
 *
 * @param line Line index.
 * @returns Line element.
 */
function chip(line: number): HTMLElement {
  return find(`[data-line="${line}"] .solid-script-editor-chip`);
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
 * Presses a key on an element.
 *
 * @param element Element.
 * @param key Key.
 * @param modifiers Modifier keys.
 */
function press(element: HTMLElement, key: string, modifiers: KeyboardEventInit = {}): void {
  element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers }));
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
 * Returns the button with a label.
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

/**
 * Drops drag data on an element.
 *
 * @param element Drop target.
 * @param data Drag data by type.
 */
function drop(element: HTMLElement, data: Record<string, string>): void {
  const event = new MouseEvent('drop', { bubbles: true, cancelable: true, clientY: -1 });
  Object.defineProperty(event, 'dataTransfer', {
    value: { types: Object.keys(data), files: [], getData: (kind: string) => data[kind] ?? '' },
  });
  element.dispatchEvent(event);
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
  it('lists the commands by category, without the End and Blank Line lines', () => {
    const { root } = editorFixture(CUBE_SPHERE);
    const captions = [...root.querySelectorAll('.solid-script-editor-palette-caption')].map(
      (caption) => caption.textContent,
    );
    expect(captions).toEqual(['Solids', '2D Shapes', 'Transforms', 'Combine', 'Logic', 'Parts']);
    expect(root.querySelector('.solid-script-editor-palette-item[data-command="cylinder"]')).not.toBeNull();
    expect(root.querySelector('.solid-script-editor-palette-item[data-command="end"]')).toBeNull();
    expect(root.querySelector('.solid-script-editor-palette-item[data-command="blank"]')).toBeNull();
  });

  it('has no place to type code: every line is a command line', () => {
    const { root } = editorFixture([...CUBE_SPHERE, { command: 'blank' }, { command: 'note' }]);
    expect(root.querySelectorAll('.solid-script-editor-lines input, .solid-script-editor-lines textarea')).toHaveLength(
      0,
    );
    expect(root.querySelectorAll('.solid-script-editor-lines [contenteditable]')).toHaveLength(0);
    expect(root.querySelectorAll('.solid-script-editor-chip')).toHaveLength(4);
  });

  it('shows every parameter of a line as its caption and value', () => {
    editorFixture([{ command: 'cube', values: { size: '[2, 2, 2]', center: 'true' } }]);
    const pills = [...chip(0).querySelectorAll('.solid-script-editor-parameter')].map((pill) => [
      pill.querySelector('.solid-script-editor-parameter-name')?.textContent,
      pill.querySelector('.solid-script-editor-parameter-value')?.textContent,
    ]);
    expect(pills).toEqual([
      ['Size', '[2, 2, 2]'],
      ['Center', 'Yes'],
    ]);
  });

  it('inserts a double-clicked command below the current line after configuring it, as one undo step', () => {
    const { root, commandStack, source } = editorFixture(CUBE_SPHERE);
    chip(0).focus();
    doubleClick(find('.solid-script-editor-palette-item[data-command="cylinder"]'));
    type(find<HTMLInputElement>('[data-solid-script-configurator="cylinder"] input[aria-label="Height"]'), '5');
    expect(find('.solid-script-editor-preview').textContent).toBe('cylinder(h = 5, r1 = 1, r2 = 1, center = false);');
    tool('Insert').click();
    expect(source().split('\n')[1]).toBe('cylinder(h = 5, r1 = 1, r2 = 1, center = false);');
    expect(chip(1).textContent).toContain('Cylinder');
    commandStack.undo();
    expect(root.querySelectorAll('.solid-script-editor-row')).toHaveLength(2);
  });

  it('fills a blank current line and closes a block command with an End line', () => {
    const { commands } = editorFixture([{ command: 'cube' }, { command: 'blank' }, { command: 'sphere' }]);
    chip(1).focus();
    doubleClick(find('.solid-script-editor-palette-item[data-command="union"]'));
    expect(commands()).toEqual(['cube', 'union', 'end', 'sphere']);
    expect(chip(2).textContent).toContain('End Union');
  });

  it('drops a dragged command where it lands, and cancelling the configurator inserts nothing', () => {
    const { commands, script } = editorFixture([{ command: 'cube' }]);
    drop(chip(0), { [SOLID_SCRIPT_EDITOR_DRAG_COMMAND]: 'sphere' });
    tool('Cancel').click();
    expect(commands()).toEqual(['cube']);
    drop(chip(0), { [SOLID_SCRIPT_EDITOR_DRAG_COMMAND]: 'sphere' });
    type(find<HTMLInputElement>('[data-solid-script-configurator="sphere"] input'), '2');
    tool('Insert').click();
    expect(commands()).toEqual(['sphere', 'cube']);
    expect(script().blocks[0]?.values).toEqual({ r: '2' });
  });

  it('reopens the configurator of a line on double-click or Enter and applies the change', () => {
    const { source } = editorFixture([{ command: 'translate' }, { command: 'cube' }, { command: 'end' }]);
    doubleClick(chip(0));
    const fields = document.querySelectorAll<HTMLInputElement>('[data-solid-script-configurator="translate"] input');
    expect([...fields].map((input) => input.value)).toEqual(['0', '0', '1']);
    type(fields[2] as HTMLInputElement, '3');
    tool('Apply').click();
    expect(source().split('\n')[0]).toBe('translate(v = [0, 0, 3]) {');
    press(chip(1), 'Enter');
    expect(document.querySelector('[data-solid-script-configurator="cube"]')).not.toBeNull();
  });

  it('adds blank lines, removes and moves lines with the keyboard, and keeps End with its block', () => {
    const { commands, root } = editorFixture([
      { command: 'cube' },
      { command: 'union' },
      { command: 'sphere' },
      { command: 'end' },
    ]);
    press(chip(0), 'Enter', { shiftKey: true });
    expect(commands()).toEqual(['cube', 'blank', 'union', 'sphere', 'end']);
    press(chip(1), 'Delete');
    press(chip(3), 'Delete');
    expect(commands()).toEqual(['cube', 'union', 'sphere', 'end']);
    expect(root.textContent).toContain('Remove the line that opens this block');
    press(chip(1), 'ArrowUp', { ctrlKey: true, shiftKey: true });
    expect(commands()).toEqual(['union', 'sphere', 'end', 'cube']);
  });

  it('explains the selected line in the help panel with every value and hint', () => {
    const { root } = editorFixture([{ command: 'cylinder', values: { h: '4' } }]);
    chip(0).focus();
    const help = find('.solid-script-editor-help');
    expect(help.textContent).toContain('Cylinder');
    expect(help.textContent).toContain('Height along Z in metres.');
    expect(
      help.querySelector('.solid-script-editor-help-parameter .solid-script-editor-parameter-value')?.textContent,
    ).toBe('4');
    const center = [...help.querySelectorAll('.solid-script-editor-help-parameter')].at(-1);
    expect(center?.querySelector('.solid-script-editor-parameter-value')?.textContent).toBe('No');
    find<HTMLElement>('.solid-script-editor-palette-item[data-command="sphere"]').focus();
    expect(root.querySelector('.solid-script-editor-help-title')?.textContent).toBe('Sphere');
  });

  it('shows errors with their line', () => {
    const { root } = editorFixture([{ command: 'cube' }, { command: 'sphere', values: { r: '1 +' } }]);
    expect(root.querySelector('.solid-script-editor-output-text')?.textContent).toMatch(/^Line 2/);
    expect(root.querySelector('[data-line="1"]')?.classList.contains('solid-script-editor-failed')).toBe(true);
  });

  it('steps through the solids, shows the variables of the step, traces passed lines and stops', () => {
    const { root, node, stepId } = editorFixture([
      { command: 'variable', values: { name: 'width', value: '2' } },
      { command: 'repeat', values: { variable: 'i', from: '0', to: '1', step: '1' } },
      { command: 'cube', values: { size: 'width' } },
      { command: 'end' },
    ]);
    tool('Trace').click();
    tool('Step').click();
    expect(solidScriptDebugStepLimit(node, stepId)).toBe(1);
    tool('Step').click();
    expect(root.querySelector('.solid-script-editor-stepped')?.getAttribute('data-line')).toBe('2');
    expect(root.querySelector('.solid-script-editor-traced')?.getAttribute('data-line')).toBe('2');
    expect(root.textContent).toContain('Step 2 of 2');
    const variables = [...root.querySelectorAll('.solid-script-editor-variable')].map((row) => row.textContent);
    expect(variables).toEqual(['width2', 'i1']);
    tool('Stop').click();
    expect(solidScriptDebugStepLimit(node, stepId)).toBeUndefined();
    expect(root.querySelector('.solid-script-editor-stepped')).toBeNull();
  });

  it('saves the script into the project under its name and loads it back', async () => {
    const folder = new ProjectMockDirectoryHandle('game');
    projectFolderCurrentSet(new ProjectFileSystemHandle(folder.asHandle()));
    const { node, stepId, commands, script, root } = editorFixture([{ command: 'cube' }]);
    tool('Save…').click();
    await settle();
    type(find<HTMLInputElement>('[data-solid-script-file-dialog="save"] input'), 'Block');
    tool('Save').click();
    await settle();
    expect(folder.handleAt('AiWorldEd/Scripts/Block.aiscript')).toBeTruthy();
    expect(script().name).toBe('Block');
    expect(root.textContent).toContain('SolidScript — Block');
    modifierStackParametersCommit(node, stepId, { script: solidScriptDocumentCreate([{ command: 'sphere' }]) }, null);
    tool('Load…').click();
    await settle();
    find('[data-solid-script-file="Block.aiscript"]').click();
    tool('Load').click();
    await settle();
    expect(commands()).toEqual(['cube']);
  });

  it('replaces the script with an .aiscript file dropped from the project browser', async () => {
    const folder = new ProjectMockDirectoryHandle('game');
    const fileSystem = new ProjectFileSystemHandle(folder.asHandle());
    projectFolderCurrentSet(fileSystem);
    await fileSystem.fileWrite(
      'Arch.aiscript',
      await solidScriptFileEncode(solidScriptDocumentCreate([{ command: 'sphere' }], 'Arch')),
    );
    const { commands, script } = editorFixture(CUBE_SPHERE);
    drop(find('.solid-script-editor-lines'), { [PANEL_PROJECT_PATH_DRAG_TYPE]: 'Arch.aiscript' });
    await settle();
    expect(commands()).toEqual(['sphere']);
    expect(script().name).toBe('Arch');
  });
});
