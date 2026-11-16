import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  const refreshes = { count: 0 };
  const target: ModifierStackActionTarget = {
    volume: node,
    stepId,
    commandStack,
    status: () => {},
    refresh: () => void refreshes.count++,
  };
  solidScriptEditorOpen(target);
  const root = document.querySelector<HTMLElement>('[data-solid-script-editor]');
  if (!root) throw new Error('Expected the editor window');
  const script = (): SolidScriptDocument =>
    solidScriptDocumentNormalize(ModifierVolume.read(node).modifiers[0]?.parameters['script']);
  const commands = (): string[] => script().blocks.map((block) => block.command);
  return { node, stepId, commandStack, root, script, commands, refreshes };
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

/**
 * Reads the rows of the variable explorer as name|value|type|lines.
 *
 * @returns Rows.
 */
function explorerRows(): string[] {
  return [...document.querySelectorAll<HTMLElement>('.solid-script-editor-explorer-row[data-name]')].map((row) =>
    [...row.children]
      .map((cell) =>
        cell.classList.contains('solid-script-editor-explorer-lines')
          ? [...cell.children].map((link) => link.textContent).join(',')
          : cell.textContent,
      )
      .join('|'),
  );
}

describe('SolidScript editor', () => {
  it('lists the commands by category, without the End and Blank Line lines', () => {
    const { root } = editorFixture(CUBE_SPHERE);
    const captions = [...root.querySelectorAll('.solid-script-editor-palette-caption')].map(
      (caption) => caption.textContent,
    );
    expect(captions).toEqual([
      'Solids',
      'Generators',
      '2D Shapes',
      'Transforms',
      'Combine',
      'Meshes',
      'Faces',
      'Inputs',
      'Logic',
      'Parts',
    ]);
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

  it('lists a line as its command name and values, with variables marked', () => {
    editorFixture([
      { command: 'cube', values: { size: '2, 2, 2', center: 'false' } },
      { command: 'sphere', values: { r: '[radius]' } },
      { command: 'note', values: { text: 'Walls' } },
    ]);
    expect(chip(0).textContent).toBe("Cube  '2, 2, 2' (Not Centered)");
    expect(chip(0).querySelector('.solid-script-editor-list-name')?.textContent?.trim()).toBe('Cube');
    expect(chip(0).querySelector('.solid-script-editor-list-value')?.textContent).toBe("'2, 2, 2'");
    expect(chip(1).querySelector('.solid-script-editor-list-variable')?.textContent).toBe('[radius]');
    expect(chip(2).textContent).toBe('***  Walls');
  });

  it('inserts a double-clicked command below the current line after configuring it, as one undo step', () => {
    const { root, commandStack, script } = editorFixture(CUBE_SPHERE);
    chip(0).focus();
    doubleClick(find('.solid-script-editor-palette-item[data-command="cylinder"]'));
    type(find<HTMLInputElement>('[data-solid-script-configurator="cylinder"] input[aria-label="Height"]'), '5');
    expect(find('.solid-script-editor-preview').textContent).toContain("height '5'");
    tool('OK').click();
    expect(script().blocks[1]?.values?.['h']).toBe('5');
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
    tool('OK').click();
    expect(commands()).toEqual(['sphere', 'cube']);
    expect(script().blocks[0]?.values?.['r']).toBe('2');
  });

  it('reopens the configurator of a line on double-click or Enter and applies the change', () => {
    const { script } = editorFixture([{ command: 'translate' }, { command: 'cube' }, { command: 'end' }]);
    doubleClick(chip(0));
    const fields = document.querySelectorAll<HTMLInputElement>('[data-solid-script-configurator="translate"] input');
    expect([...fields].map((input) => input.value)).toEqual(['0', '0', '0']);
    type(fields[2] as HTMLInputElement, '3');
    tool('OK').click();
    expect(script().blocks[0]?.values?.['v']).toBe('0, 0, 3');
    press(chip(1), 'Enter');
    expect(document.querySelector('[data-solid-script-configurator="cube"]')).not.toBeNull();
  });

  it('suggests the names of the script while typing, inserts them and checks fields as they are typed', () => {
    const { script } = editorFixture([
      { command: 'input', values: { name: 'steps', type: 'count', default: '3' } },
      { command: 'variable', values: { name: 'width', value: '2' } },
      { command: 'cube' },
    ]);
    doubleClick(chip(2));
    const [x] = document.querySelectorAll<HTMLInputElement>('[data-solid-script-configurator="cube"] input');
    if (!x) throw new Error('Expected the Size X input');
    x.focus();
    x.setSelectionRange(0, x.value.length);
    type(x, '[w');
    x.setSelectionRange(2, 2);
    x.dispatchEvent(new Event('input', { bubbles: true }));
    const list = find('[data-solid-script-configurator="cube"] [role="listbox"]');
    expect(list.hidden).toBe(false);
    expect([...list.querySelectorAll('[role="option"]')].map((option) => option.firstChild?.textContent)).toEqual([
      'width',
    ]);
    press(x, 'Enter');
    expect(x.value).toBe('[width]');
    expect(document.querySelector('[data-solid-script-configurator="cube"]')).not.toBeNull();
    type(x, '[depth]');
    const dialog = find('[data-solid-script-configurator="cube"]');
    expect(dialog.textContent).toContain('no line sets [depth] yet');
    expect(tool('OK').disabled).toBe(false);
    type(x, '[=1 +');
    expect(x.classList.contains('solid-script-editor-invalid')).toBe(true);
    expect(tool('OK').disabled).toBe(true);
    type(x, '');
    x.setSelectionRange(0, 0);
    find<HTMLButtonElement>(
      '[data-solid-script-configurator="cube"] button[aria-label="Insert Name into Size"]',
    ).click();
    const options = [...list.querySelectorAll('[role="option"]')].map((option) => option.firstChild?.textContent);
    expect(options.slice(0, 2)).toEqual(['steps', 'width']);
    expect(list.textContent).toContain('Built-In Functions');
    list.querySelector('[role="option"]')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(x.value).toBe('[steps]');
    tool('OK').click();
    expect(script().blocks[2]?.values['size']).toMatch(/^\[steps\], /);
  });

  it('checks Input lines while they are configured and lists what the script defines in the variable explorer', () => {
    editorFixture([
      { command: 'input', values: { name: 'steps', type: 'count', default: '3' } },
      { command: 'variable', values: { name: 'width', value: '2' } },
      { command: 'cube' },
    ]);
    doubleClick(chip(0));
    const type_ = find<HTMLInputElement>('[data-solid-script-configurator="input"] input[aria-label="Type"]');
    type(type_, 'colour');
    expect(find('[data-solid-script-configurator="input"]').textContent).toContain('Type must be one of');
    expect(tool('OK').disabled).toBe(true);
    press(type_, 'Escape');
    find<HTMLButtonElement>('[data-tab="variables"]').click();
    expect(explorerRows()).toEqual(['steps|3|Whole Number · Read Only|1', 'width|2|Whole Number|2']);
    find<HTMLButtonElement>('[data-category="Inputs"]').click();
    expect(explorerRows()).toEqual(['steps|3|Whole Number · Read Only|1']);
    find<HTMLButtonElement>('[data-category="All"]').click();
    find<HTMLElement>('.solid-script-editor-explorer-row[data-name="width"]').click();
    expect(document.activeElement).toBe(chip(1));
  });

  it('shows the configurator as a window titled with the command, OK on the left and Cancel on the right', () => {
    const { commands } = editorFixture([{ command: 'cube' }]);
    doubleClick(chip(0));
    const dialog = find('[data-solid-script-configurator="cube"]');
    expect(dialog.querySelector('[id^="solid-script-dialog-"]')?.textContent).toBe('Cube');
    const buttons = [...dialog.querySelectorAll('button')].map((button) => button.textContent);
    expect(buttons.slice(-2)).toEqual(['OK', 'Cancel']);
    const manual = find('[data-solid-script-configurator="cube"] [aria-label="Manual"]:not(button)');
    expect(manual.hidden).toBe(true);
    find<HTMLButtonElement>('[data-solid-script-configurator="cube"] button[aria-label="Manual"]').click();
    expect(manual.hidden).toBe(false);
    expect(document.querySelector('.editor-message-box-backdrop')).not.toBeNull();
    find<HTMLButtonElement>('[data-solid-script-configurator="cube"] button[aria-label="Close"]').click();
    expect(document.querySelector('[data-solid-script-configurator]')).toBeNull();
    doubleClick(chip(0));
    press(find<HTMLInputElement>('[data-solid-script-configurator="cube"] input'), 'Escape');
    expect(document.querySelector('[data-solid-script-configurator]')).toBeNull();
    expect(commands()).toEqual(['cube']);
  });

  it('keeps Delete and Backspace in the window after a click anywhere in it, so the generator stays', () => {
    const { root, node, commands } = editorFixture(CUBE_SPHERE);
    const scene = vi.fn();
    window.addEventListener('keydown', scene);
    try {
      for (const selector of [
        '.solid-script-editor-help',
        '.solid-script-editor-toolbar',
        '.solid-script-editor-output',
      ]) {
        find(selector).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        expect(root.contains(document.activeElement)).toBe(true);
        press(document.activeElement as HTMLElement, 'Delete');
        press(document.activeElement as HTMLElement, 'Backspace');
      }
    } finally {
      window.removeEventListener('keydown', scene);
    }
    expect(scene).not.toHaveBeenCalled();
    expect(node.parent).not.toBeNull();
    expect(commands()).toEqual(['cube', 'sphere']);
  });

  it('adds blank lines, and removes and moves single lines with the keyboard, End lines too', () => {
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
    expect(commands()).toEqual(['cube', 'union', 'sphere']);
    expect(root.textContent).toContain('Line 2: Union has no End');
    press(chip(1), 'ArrowUp', { ctrlKey: true, shiftKey: true });
    expect(commands()).toEqual(['union', 'cube', 'sphere']);
  });

  it('selects lines with Shift, copies, cuts and pastes exactly those lines, and Space adds a blank line', () => {
    const { commands, root, commandStack } = editorFixture([
      { command: 'cube' },
      { command: 'union' },
      { command: 'sphere' },
      { command: 'end' },
      { command: 'cylinder' },
    ]);
    chip(0).focus();
    press(chip(0), 'ArrowDown', { shiftKey: true });
    expect(document.activeElement).toBe(chip(1));
    expect(find('[data-line="0"]').classList.contains('solid-script-editor-selected')).toBe(true);
    expect(find('[data-line="1"]').classList.contains('solid-script-editor-current')).toBe(true);
    expect(find('[data-line="1"]').classList.contains('solid-script-editor-selected')).toBe(false);
    press(chip(1), 'c', { ctrlKey: true });
    expect(root.textContent).toContain('Copied 2 lines.');
    chip(4).focus();
    press(chip(4), 'v', { ctrlKey: true });
    expect(commands()).toEqual(['cube', 'union', 'sphere', 'end', 'cylinder', 'cube', 'union']);
    find('[data-line="5"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    find('[data-line="6"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, shiftKey: true }));
    press(chip(6), 'x', { ctrlKey: true });
    expect(commands()).toEqual(['cube', 'union', 'sphere', 'end', 'cylinder']);
    press(chip(4), ' ');
    expect(commands()).toEqual(['cube', 'union', 'sphere', 'end', 'cylinder', 'blank']);
    chip(0).focus();
    press(chip(0), 'a', { ctrlKey: true });
    press(document.activeElement as HTMLElement, 'Delete');
    expect(commands()).toEqual([]);
    commandStack.undo();
    expect(commands()).toEqual(['cube', 'union', 'sphere', 'end', 'cylinder', 'blank']);
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
    const center = [...help.querySelectorAll('.solid-script-editor-help-parameter')].find((row) =>
      row.textContent?.includes('Center'),
    );
    expect(center?.querySelector('.solid-script-editor-parameter-value')?.textContent).toBe('Yes');
    expect(help.textContent).toContain('Stops the script when');
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
      { command: 'cube', values: { size: '[width]' } },
      { command: 'end' },
    ]);
    tool('Trace').click();
    tool('Step').click();
    expect(solidScriptDebugStepLimit(node, stepId)).toBe(1);
    tool('Step').click();
    expect(root.querySelector('.solid-script-editor-stepped')?.getAttribute('data-line')).toBe('2');
    expect(root.querySelector('.solid-script-editor-traced')?.getAttribute('data-line')).toBe('2');
    expect(root.querySelector('.solid-script-editor-stepped')?.getAttribute('title')).toMatch(/^Debugger step/);
    expect(root.querySelector('.solid-script-editor-stepped')?.classList.contains('solid-script-editor-current')).toBe(
      false,
    );
    expect(root.textContent).toContain('Step 2 of 2');
    find<HTMLButtonElement>('[data-tab="variables"]').click();
    find<HTMLButtonElement>('[data-category="Current"]').click();
    expect(explorerRows()).toEqual(['width|2|Whole Number|1', 'i|1|Whole Number|2']);
    tool('Stop').click();
    expect(solidScriptDebugStepLimit(node, stepId)).toBeUndefined();
    expect(root.querySelector('.solid-script-editor-stepped')).toBeNull();
  });

  it('clears the step mark when Debug finishes, and Start builds the whole script at once', () => {
    vi.useFakeTimers();
    try {
      const { root, node, stepId } = editorFixture([{ command: 'cube' }, { command: 'sphere' }]);
      tool('Debug').click();
      expect(tool('Pause')).toBeTruthy();
      vi.advanceTimersByTime(400);
      expect(root.querySelector('.solid-script-editor-stepped')?.getAttribute('data-line')).toBe('0');
      vi.advanceTimersByTime(2000);
      expect(root.querySelector('.solid-script-editor-stepped')).toBeNull();
      expect(root.querySelector('.solid-script-editor-traced')).toBeNull();
      expect(solidScriptDebugStepLimit(node, stepId)).toBeUndefined();
      tool('Step').click();
      expect(solidScriptDebugStepLimit(node, stepId)).toBe(1);
      tool('Start').click();
      expect(solidScriptDebugStepLimit(node, stepId)).toBeUndefined();
      expect(root.querySelector('.solid-script-editor-stepped')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('sets a breakpoint from the gutter or F9; Start pauses before that line with its variables, then continues', () => {
    const { root, node, stepId } = editorFixture([
      { command: 'sphere' },
      { command: 'repeat', values: { variable: 'i', from: '0', to: '1' } },
      { command: 'cube', values: { size: '[=[i] + 1], 1, 1' } },
      { command: 'end' },
      { command: 'note', values: { text: 'Done' } },
    ]);
    find('[data-line="2"] .solid-script-editor-gutter').click();
    expect(find('[data-line="2"]').classList.contains('solid-script-editor-breakpoint')).toBe(true);
    press(chip(4), 'F9');
    expect(find('[data-line="4"]').classList.contains('solid-script-editor-breakpoint')).toBe(false);
    expect(root.textContent).toContain('cannot hold a breakpoint');
    tool('Start').click();
    expect(solidScriptDebugStepLimit(node, stepId)).toBe(1);
    const paused = find('[data-line="2"]');
    expect(paused.classList.contains('solid-script-editor-stepped')).toBe(true);
    expect(paused.title).toMatch(/^Paused at this breakpoint/);
    expect(root.textContent).toContain('Paused at the breakpoint on line 3');
    find<HTMLButtonElement>('[data-category="Current"]').click();
    const variables = () => explorerRows().map((row) => row.split('|').slice(0, 2).join('='));
    expect(variables()).toEqual(['i=0']);
    expect(tool('Continue')).toBeTruthy();
    tool('Start').click();
    expect(solidScriptDebugStepLimit(node, stepId)).toBe(2);
    expect(variables()).toEqual(['i=1']);
    tool('Step').click();
    expect(solidScriptDebugStepLimit(node, stepId)).toBe(3);
    expect(tool('Debug')).toBeTruthy();
    tool('Start').click();
    expect(solidScriptDebugStepLimit(node, stepId)).toBeUndefined();
    expect(root.querySelector('.solid-script-editor-stepped')).toBeNull();
  });

  it('gives every scrolling area the custom scrollbar instead of the native one', () => {
    const { root } = editorFixture(CUBE_SPHERE);
    for (const selector of [
      '.solid-script-editor-lines',
      '.solid-script-editor-palette-list',
      '.solid-script-editor-help',
      '.solid-script-editor-output-text',
      '.solid-script-editor-explorer-categories',
      '.solid-script-editor-explorer-column',
    ]) {
      const area = root.querySelector<HTMLElement>(selector);
      expect(area?.classList.contains('editor-custom-scroller'), selector).toBe(true);
      expect(area?.parentElement?.children.length, selector).toBeGreaterThan(1);
    }
    doubleClick(chip(0));
    const field = document.querySelector<HTMLInputElement>('[data-solid-script-configurator] input[type="text"]')!;
    const list = field
      .closest('[data-solid-script-configurator]')
      ?.querySelector<HTMLElement>('.solid-script-editor-suggestions');
    expect(list?.classList.contains('editor-custom-scroller')).toBe(true);
  });

  it('adds Input lines from the Variables tab, after the other inputs', () => {
    const { root, commands, script } = editorFixture(CUBE_SPHERE);
    find('[data-tab="variables"]').click();
    const add = () => root.querySelector<HTMLButtonElement>('.solid-script-editor-input-add')!;
    expect(add().textContent).toBe('Add Input');
    add().click();
    expect(document.querySelector('[data-solid-script-configurator]')).toBeTruthy();
    tool('OK').click();
    expect(commands()).toEqual(['input', 'cube', 'sphere']);
    add().click();
    tool('OK').click();
    expect(commands()).toEqual(['input', 'input', 'cube', 'sphere']);
    expect(script().blocks.map((block) => block.values['name'])).toEqual(['width', 'input2', undefined, undefined]);
    expect(add().textContent).toBe('Add Input');
  });

  it('redraws the inspector after every edit, so new Input lines show there', () => {
    const { refreshes, commands } = editorFixture(CUBE_SPHERE);
    press(chip(1), 'Delete');
    expect(commands()).toEqual(['cube']);
    expect(refreshes.count).toBe(1);
  });

  it('pauses at a breakpoint inside a Function and shows the call stack with its locals', () => {
    const { root } = editorFixture([
      { command: 'function', values: { name: 'post', parameters: 'h' } },
      { command: 'cube', values: { size: '1, 1, [local.h]' } },
      { command: 'end' },
      { command: 'call', values: { name: 'post', values: '3' } },
    ]);
    find('[data-line="1"] .solid-script-editor-gutter').click();
    tool('Start').click();
    expect(root.textContent).toContain('Paused at the breakpoint on line 2');
    find<HTMLButtonElement>('[data-category="Call Stack"]').click();
    expect(find('.solid-script-editor-stack-frame').textContent).toBe('post()called on line 4');
    expect(explorerRows()).toEqual(['local.h|3|Whole Number|1']);
  });

  it('explores variables: search, lists by index, every Set line, and Insert into the open field', () => {
    editorFixture([
      { command: 'variable', values: { name: 'pts()', value: '1, 2' } },
      { command: 'variable', values: { name: 'pts()', value: '3, 4' } },
      { command: 'variable', values: { name: 'label', value: 'Hall' } },
      { command: 'variable', values: { name: 'label', value: 'Big Hall' } },
      { command: 'cube' },
      { command: 'if', values: { condition: '1 == 2' } },
      { command: 'variable', values: { name: 'later', value: '1' } },
      { command: 'end' },
    ]);
    find<HTMLButtonElement>('[data-tab="variables"]').click();
    expect(explorerRows()).toEqual([
      'label|Big Hall|Text|3,4',
      'later|—|Not Set Yet|7',
      '▸ pts()|[[1, 2], [3, 4]]|List of Vectors|1,2',
    ]);
    find<HTMLElement>('.solid-script-editor-explorer-row[data-name="pts"] > span').click();
    expect(explorerRows().slice(2)).toEqual([
      '▾ pts()|[[1, 2], [3, 4]]|List of Vectors|1,2',
      'pts(0)|[1, 2]|Vector|1,2',
      'pts(1)|[3, 4]|Vector|1,2',
    ]);
    const search = find<HTMLInputElement>('.solid-script-editor-explorer-search');
    type(search, 'text');
    expect(explorerRows()).toEqual(['label|Big Hall|Text|3,4']);
    press(search, 'Escape');
    expect(explorerRows()).toHaveLength(5);
    find<HTMLButtonElement>(
      '.solid-script-editor-explorer-row[data-name="label"] .solid-script-editor-explorer-line:last-child',
    ).click();
    expect(document.activeElement).toBe(chip(3));
    find<HTMLElement>('.solid-script-editor-explorer-row[data-name="label"]').click();
    find<HTMLButtonElement>('.solid-script-editor-explorer-insert').click();
    expect(find('.solid-script-editor-explorer-status').textContent).toMatch(/^Open the settings of a line/);
    doubleClick(chip(4));
    const size = find<HTMLInputElement>('[data-solid-script-configurator="cube"] input[type="text"]');
    size.focus();
    size.value = '';
    find<HTMLButtonElement>('.solid-script-editor-explorer-insert').click();
    expect(size.value).toBe('[label]');
    expect(find('.solid-script-editor-explorer-status').textContent).toBe('Inserted [label].');
  });

  it('keeps a breakpoint on its line when the line moves', () => {
    const { commands } = editorFixture([{ command: 'cube' }, { command: 'sphere' }, { command: 'cylinder' }]);
    press(chip(2), 'F9');
    expect(find('[data-line="2"]').classList.contains('solid-script-editor-breakpoint')).toBe(true);
    press(chip(2), 'ArrowUp', { ctrlKey: true, shiftKey: true });
    expect(commands()).toEqual(['cube', 'cylinder', 'sphere']);
    expect(find('[data-line="1"]').classList.contains('solid-script-editor-breakpoint')).toBe(true);
    expect(find('[data-line="2"]').classList.contains('solid-script-editor-breakpoint')).toBe(false);
  });

  it('pauses Debug at a breakpoint and continues playing from it', () => {
    vi.useFakeTimers();
    try {
      const { root, node, stepId } = editorFixture([
        { command: 'cube' },
        { command: 'sphere' },
        { command: 'cylinder' },
      ]);
      press(chip(1), 'F9');
      tool('Debug').click();
      vi.advanceTimersByTime(400 * 3);
      expect(solidScriptDebugStepLimit(node, stepId)).toBe(1);
      expect(root.querySelector('.solid-script-editor-stepped')?.getAttribute('data-line')).toBe('1');
      vi.advanceTimersByTime(400 * 3);
      expect(solidScriptDebugStepLimit(node, stepId)).toBe(1);
      tool('Continue').click();
      vi.advanceTimersByTime(400 * 10);
      expect(solidScriptDebugStepLimit(node, stepId)).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('searches the palette by name, description and category; arrows pick, Enter inserts, Escape clears', () => {
    const { root, commands } = editorFixture([{ command: 'cube' }]);
    const search = find<HTMLInputElement>('.solid-script-editor-palette-search');
    press(chip(0), 'f', { ctrlKey: true });
    expect(document.activeElement).toBe(search);
    type(search, 'ball');
    const shown = () =>
      [...root.querySelectorAll<HTMLElement>('.solid-script-editor-palette-item')]
        .filter((item) => !item.hidden)
        .map((item) => item.dataset['command']);
    expect(shown()).toEqual(['sphere']);
    type(search, 'logic');
    expect(shown()).toContain('repeat');
    expect(shown()).not.toContain('cube');
    expect(find('.solid-script-editor-palette-highlighted').dataset['command']).toBe(shown()[0]);
    type(search, 'cyl');
    press(search, 'ArrowDown');
    press(search, 'Enter');
    tool('OK').click();
    expect(commands()).toEqual(['cube', 'cylinder']);
    press(search, 'Escape');
    expect(search.value).toBe('');
    expect(shown().length).toBeGreaterThan(10);
    type(search, 'zzzz');
    expect(root.textContent).toContain('No command matches');
  });

  it('keeps typing in the search inside the window, undo keys included', () => {
    editorFixture(CUBE_SPHERE);
    const scene = vi.fn();
    window.addEventListener('keydown', scene);
    try {
      const search = find<HTMLInputElement>('.solid-script-editor-palette-search');
      for (const key of ['Delete', 'Backspace', 'a', 'z']) press(search, key, { ctrlKey: key === 'z' });
    } finally {
      window.removeEventListener('keydown', scene);
    }
    expect(scene).not.toHaveBeenCalled();
  });

  it('keeps every line on one row of fixed height that scrolls sideways', () => {
    const { root } = editorFixture([
      { command: 'note', values: { text: 'A very long note '.repeat(20) } },
      { command: 'cube' },
    ]);
    const rows = [...root.querySelectorAll<HTMLElement>('.solid-script-editor-row')];
    expect(rows.map((row) => row.style.top)).toEqual(['4px', '28px']);
    const canvas = find('.solid-script-editor-lines-canvas');
    expect(parseFloat(canvas.style.width)).toBeGreaterThan(2000);
    expect(root.querySelector('.solid-script-editor-lines-host')?.children.length).toBeGreaterThanOrEqual(3);
  });

  it('orders the run buttons Start, Debug, Step, Stop', () => {
    const { root } = editorFixture(CUBE_SPHERE);
    const labels = [...root.querySelectorAll('.solid-script-editor-toolbar button')].map(
      (button) => button.textContent,
    );
    expect(labels.slice(0, 4)).toEqual(['Start', 'Debug', 'Step', 'Stop']);
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
