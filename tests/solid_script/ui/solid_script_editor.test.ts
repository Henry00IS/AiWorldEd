import { ManagerInput } from '@/input/manager_input.js';
import { HandlerKeyboardShortcut } from '@/input/handler_keyboard_shortcut.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SOLID_SCRIPT_EDITOR_CHECK_DELAY_MS } from '@/solid_script/ui/solid_script_editor_output.js';
import { CommandStack } from '@/commands/command_stack.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { MODIFIER_STACK_SOLID_SCRIPT_KIND } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';
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
import { SOLID_SCRIPT_EDITOR_DRAG_LINE } from '@/solid_script/ui/solid_script_editor_row.js';
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
 * Presses an undo or redo key in the script editor's lines.
 *
 * @param key Z or Y.
 * @param modifiers Extra modifier keys, such as Shift for Ctrl+Shift+Z.
 */
function scriptKey(key: 'z' | 'y', modifiers: KeyboardEventInit = {}): void {
  press(find('[data-solid-script-editor] .solid-script-editor-lines'), key, { ctrlKey: true, ...modifiers });
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
  it('lists the commands by category, with End in Logic and without Blank Line', () => {
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
      'Lists',
      'Parts',
    ]);
    expect(root.querySelector('.solid-script-editor-palette-item[data-command="cylinder"]')).not.toBeNull();
    expect(root.querySelector('.solid-script-editor-palette-item[data-command="end"]')).not.toBeNull();
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
    expect(chip(0).textContent).toBe("Cube '2, 2, 2' (Not Centered)");
    expect(chip(0).querySelector('.solid-script-editor-list-name')?.textContent?.trim()).toBe('Cube');
    expect(chip(0).querySelector('.solid-script-editor-list-value')?.textContent).toBe("'2, 2, 2'");
    expect(chip(1).querySelector('.solid-script-editor-list-variable')?.textContent).toBe('[radius]');
    expect(chip(2).textContent).toBe('*** Walls');
  });

  it('inserts a double-clicked command below the current line after configuring it, as one undo step', () => {
    const { root, script } = editorFixture(CUBE_SPHERE);
    chip(0).focus();
    doubleClick(find('.solid-script-editor-palette-item[data-command="cylinder"]'));
    type(find<HTMLInputElement>('[data-solid-script-configurator="cylinder"] input[aria-label="Height"]'), '5');
    expect(find('.solid-script-editor-preview').textContent).toContain("height '5'");
    tool('OK').click();
    expect(script().blocks[1]?.values?.['h']).toBe('5');
    expect(chip(1).textContent).toContain('Cylinder');
    scriptKey('z');
    expect(root.querySelectorAll('.solid-script-editor-row')).toHaveLength(2);
  });

  it('fills a blank current line and closes a block command with an End line', () => {
    const { commands } = editorFixture([{ command: 'cube' }, { command: 'blank' }, { command: 'sphere' }]);
    chip(1).focus();
    doubleClick(find('.solid-script-editor-palette-item[data-command="union"]'));
    expect(commands()).toEqual(['cube', 'union', 'end', 'sphere']);
    expect(chip(2).textContent).toContain('End Union');
  });

  it('keeps script edits in its own undo history, apart from the scene history', () => {
    const { commands, commandStack } = editorFixture(CUBE_SPHERE);
    chip(0).focus();
    doubleClick(find('.solid-script-editor-palette-item[data-command="union"]'));
    expect(commands()).toEqual(['cube', 'union', 'end', 'sphere']);
    expect(commandStack.getUndoCount()).toBe(0);
    expect(commandStack.isAtSavedPoint()).toBe(false);
    commandStack.undo();
    expect(commands()).toEqual(['cube', 'union', 'end', 'sphere']);
    scriptKey('z');
    expect(commands()).toEqual(['cube', 'sphere']);
    scriptKey('y');
    expect(commands()).toEqual(['cube', 'union', 'end', 'sphere']);
    scriptKey('z');
    scriptKey('z', { shiftKey: true });
    expect(commands()).toEqual(['cube', 'union', 'end', 'sphere']);
  });

  it('leaves the script alone on scene undo and the scene alone on script undo', () => {
    const { commands, commandStack, node, stepId } = editorFixture(CUBE_SPHERE);
    const inputs = () => ModifierVolume.read(node).modifiers[0]?.parameters['inputs'];
    const start = inputs();
    modifierStackParametersCommit(node, stepId, { inputs: { width: '2' } }, commandStack);
    chip(0).focus();
    doubleClick(find('.solid-script-editor-palette-item[data-command="union"]'));
    commandStack.undo();
    expect(inputs()).toEqual(start);
    expect(commands()).toEqual(['cube', 'union', 'end', 'sphere']);
    commandStack.redo();
    expect(inputs()).toEqual({ width: '2' });
    expect(commands()).toEqual(['cube', 'union', 'end', 'sphere']);
    scriptKey('z');
    expect(commands()).toEqual(['cube', 'sphere']);
    expect(inputs()).toEqual({ width: '2' });
    scriptKey('z');
    expect(inputs()).toEqual({ width: '2' });
  });

  it('undoes only its own lines when someone else changed other lines since', () => {
    const { commands, script, node, stepId } = editorFixture(CUBE_SPHERE);
    chip(1).focus();
    doubleClick(find('.solid-script-editor-palette-item[data-command="union"]'));
    const theirs = script();
    const added = solidScriptDocumentCreate([{ command: 'cylinder' }]).blocks;
    modifierStackParametersCommit(node, stepId, { script: { ...theirs, blocks: [...theirs.blocks, ...added] } }, null);
    expect(commands()).toEqual(['cube', 'sphere', 'union', 'end', 'cylinder']);
    scriptKey('z');
    expect(commands()).toEqual(['cube', 'sphere', 'cylinder']);
    scriptKey('y');
    expect(commands()).toEqual(['cube', 'sphere', 'union', 'end', 'cylinder']);
  });

  it('wraps a selection whose blocks are whole in a double-clicked block command, as one undo step', () => {
    const { commands } = editorFixture([
      { command: 'cube' },
      { command: 'if' },
      { command: 'sphere' },
      { command: 'end' },
      { command: 'cylinder' },
    ]);
    chip(0).focus();
    press(chip(0), 'ArrowDown', { shiftKey: true });
    press(chip(1), 'ArrowDown', { shiftKey: true });
    press(chip(2), 'ArrowDown', { shiftKey: true });
    doubleClick(find('.solid-script-editor-palette-item[data-command="translate"]'));
    tool('OK').click();
    expect(commands()).toEqual(['translate', 'cube', 'if', 'sphere', 'end', 'end', 'cylinder']);
    expect(parseFloat(chip(1).style.paddingLeft)).toBeGreaterThan(parseFloat(chip(0).style.paddingLeft));
    scriptKey('z');
    expect(commands()).toEqual(['cube', 'if', 'sphere', 'end', 'cylinder']);
  });

  it('inserts below the current line when the selection cuts a block', () => {
    const { commands } = editorFixture([
      { command: 'cube' },
      { command: 'if' },
      { command: 'sphere' },
      { command: 'end' },
    ]);
    chip(0).focus();
    press(chip(0), 'ArrowDown', { shiftKey: true });
    doubleClick(find('.solid-script-editor-palette-item[data-command="translate"]'));
    tool('OK').click();
    expect(commands()).toEqual(['cube', 'if', 'translate', 'end', 'sphere', 'end']);
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
    const fields = document.querySelectorAll<HTMLInputElement>(
      '[data-solid-script-configurator="translate"] input:not([hidden])',
    );
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
    // The list opens over the page, never inside the window where it gets cut off.
    const list = find('body > .solid-script-editor-suggestions-host [role="listbox"]');
    expect(list.closest('[data-solid-script-configurator]')).toBeNull();
    const typed = [...list.querySelectorAll('[role="option"]')].map((option) => option.firstChild?.textContent);
    expect(typed[0]).toBe('width');
    expect(typed).toContain('Box.Width');
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
    // Entering a field leaves the list closed; clicking it opens the list at the caret.
    x.value = '[';
    x.setSelectionRange(1, 1);
    x.blur();
    expect(document.querySelector('[aria-label="Suggestions"]')).toBeNull();
    x.focus();
    expect(document.querySelector('[aria-label="Suggestions"]')).toBeNull();
    x.click();
    expect(
      [...document.querySelectorAll('[aria-label="Suggestions"] [role="option"]')].map(
        (option) => option.firstChild?.textContent,
      ),
    ).toContain('Box.Width');
    const styles = [...document.querySelectorAll('style')].map((style) => style.textContent ?? '').join('\n');
    // Group headings stick flush to the top of the list: no top padding above them to show rows through.
    expect(styles).toMatch(/\.solid-script-editor-suggestions \{[^}]*padding: 0 0 4px;/);
    expect(styles).toMatch(/\.solid-script-editor-suggestion-heading \{[^}]*position: sticky; top: 0;[^}]*background:/);
    x.blur();
    x.value = '$[';
    x.setSelectionRange(2, 2);
    x.focus();
    expect(document.querySelector('[aria-label="Suggestions"]')).toBeNull();
    x.value = '[';
    x.setSelectionRange(1, 1);
    x.click();
    const pick = [...document.querySelectorAll<HTMLElement>('[aria-label="Suggestions"] [role="option"]')].find(
      (option) => option.firstChild?.textContent === 'Box.Width',
    )!;
    pick.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(x.value).toBe('[Box.Width]');
    expect(document.activeElement).toBe(x);
    tool('OK').click();
    expect(script().blocks[2]?.values['size']).toMatch(/^\[Box\.Width\], /);
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
    // The title bar holds only the title and the X.
    const bar = find('[data-solid-script-configurator="cube"] [id^="solid-script-dialog-"]').parentElement!;
    expect([...bar.querySelectorAll('button')].map((button) => button.getAttribute('aria-label'))).toEqual(['Close']);
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
    const input = new ManagerInput();
    const handler = new HandlerKeyboardShortcut(input);
    const scene = vi.fn();
    handler.setOnDeleteSelected(scene);
    handler.register();
    try {
      for (const selector of [
        '.solid-script-editor-help',
        '.solid-script-editor-toolbar',
        '.solid-script-editor-output',
      ]) {
        find(selector).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
        expect(root.contains(document.activeElement)).toBe(true);
        press(document.activeElement as HTMLElement, 'Delete');
        press(document.activeElement as HTMLElement, 'Backspace');
      }
    } finally {
      handler.unregister();
      input.dispose();
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

  it('picks single lines with Ctrl+click, copies them squashed together and drags them all as one undo step', () => {
    const { commands, root } = editorFixture([
      { command: 'cube' },
      { command: 'sphere' },
      { command: 'cylinder' },
      { command: 'variable', values: { name: 'a', value: '1' } },
    ]);
    const down = (line: number, init: MouseEventInit = {}) =>
      chip(line).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, ...init }));
    const marked = (line: number) =>
      ['solid-script-editor-selected', 'solid-script-editor-current'].some((name) =>
        find(`[data-line="${line}"]`).classList.contains(name),
      );
    down(0);
    down(2, { ctrlKey: true });
    expect([0, 1, 2, 3].map(marked)).toEqual([true, false, true, false]);
    chip(2).dispatchEvent(new Event('copy', { bubbles: true, cancelable: true }));
    expect(root.textContent).toContain('Copied 2 lines.');
    chip(3).focus();
    chip(3).dispatchEvent(new Event('paste', { bubbles: true, cancelable: true }));
    expect(commands()).toEqual(['cube', 'sphere', 'cylinder', 'variable', 'cube', 'cylinder']);
    scriptKey('z');
    down(0);
    down(2, { ctrlKey: true });
    // Pressing a picked line to drag it keeps the others picked.
    down(2);
    expect([0, 1, 2, 3].map(marked)).toEqual([true, false, true, false]);
    drop(chip(3), { [SOLID_SCRIPT_EDITOR_DRAG_LINE]: '2' });
    expect(commands()).toEqual(['sphere', 'cube', 'cylinder', 'variable']);
    scriptKey('z');
    expect(commands()).toEqual(['cube', 'sphere', 'cylinder', 'variable']);
    // A plain click without a drag picks the line alone.
    down(0);
    down(2, { ctrlKey: true });
    down(2);
    chip(2).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect([0, 1, 2, 3].map(marked)).toEqual([false, false, true, false]);
  });

  it('selects lines with Shift, copies, cuts and pastes exactly those lines, and Space adds a blank line above', () => {
    const { commands, root } = editorFixture([
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
    chip(1).dispatchEvent(new Event('copy', { bubbles: true, cancelable: true }));
    expect(root.textContent).toContain('Copied 2 lines.');
    chip(4).focus();
    chip(4).dispatchEvent(new Event('paste', { bubbles: true, cancelable: true }));
    expect(commands()).toEqual(['cube', 'union', 'sphere', 'end', 'cylinder', 'cube', 'union']);
    expect(find('[data-line="5"]').classList.contains('solid-script-editor-selected')).toBe(true);
    find('[data-line="5"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    find('[data-line="6"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, shiftKey: true }));
    chip(6).dispatchEvent(new Event('cut', { bubbles: true, cancelable: true }));
    expect(commands()).toEqual(['cube', 'union', 'sphere', 'end', 'cylinder']);
    press(chip(4), ' ');
    expect(commands()).toEqual(['cube', 'union', 'sphere', 'end', 'blank', 'cylinder']);
    expect(document.activeElement?.closest('[data-line]')?.getAttribute('data-line')).toBe('4');
    chip(0).focus();
    press(chip(0), 'a', { ctrlKey: true });
    press(document.activeElement as HTMLElement, 'Delete');
    expect(commands()).toEqual([]);
    scriptKey('z');
    expect(commands()).toEqual(['cube', 'union', 'sphere', 'end', 'blank', 'cylinder']);
  });

  it('pastes lines copied in another window from the clipboard text, keeping their values, and duplicates with Ctrl+D', () => {
    const { commands, root } = editorFixture([{ command: 'cube' }]);
    const store = new Map<string, string>();
    const clipboard = (type: string): Event => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clipboardData', {
        value: {
          setData: (kind: string, text: string) => store.set(kind, text),
          getData: (kind: string) => store.get(kind) ?? '',
        },
      });
      return event;
    };
    chip(0).dispatchEvent(clipboard('copy'));
    const copied = JSON.parse(store.get('text/plain') ?? '{}') as { lines: { command: string }[] };
    expect(copied.lines.map((line) => line.command)).toEqual(['cube']);
    store.set(
      'text/plain',
      JSON.stringify([
        { command: 'sphere', values: { r: '3' } },
        { command: 'cylinder', values: { h: '5' } },
      ]),
    );
    chip(0).dispatchEvent(clipboard('paste'));
    expect(commands()).toEqual(['cube', 'sphere', 'cylinder']);
    expect(root.textContent).toContain('Pasted 2 lines.');
    expect(root.textContent).toContain('Sphere');
    press(document.activeElement as HTMLElement, 'd', { ctrlKey: true });
    expect(commands()).toEqual(['cube', 'sphere', 'cylinder', 'sphere', 'cylinder']);
    expect(find('[data-line="3"]').textContent).toContain('3');
  });

  it('turns lines off and on with F4, keeps them off through copy and paste, and runs without them', () => {
    const { script, root } = editorFixture([
      { command: 'cube' },
      { command: 'union' },
      { command: 'sphere' },
      { command: 'end' },
    ]);
    chip(1).focus();
    press(chip(1), 'F4');
    expect(script().blocks.map((block) => block.off === true)).toEqual([false, true, false, true]);
    expect(root.textContent).toContain('Turned 1 line off');
    for (const line of [1, 3])
      expect(find(`[data-line="${line}"]`).classList.contains('solid-script-editor-off'), String(line)).toBe(true);
    for (const line of [0, 2])
      expect(find(`[data-line="${line}"]`).classList.contains('solid-script-editor-off'), String(line)).toBe(false);
    const run = solidScriptProgramRun(script());
    expect(run.error).toBeNull();
    expect(run.steps).toHaveLength(2);
    chip(1).dispatchEvent(new Event('copy', { bubbles: true, cancelable: true }));
    chip(3).focus();
    chip(3).dispatchEvent(new Event('paste', { bubbles: true, cancelable: true }));
    expect(script().blocks[4]).toMatchObject({ command: 'union', off: true });
    press(chip(1), '/', { ctrlKey: true });
    expect(script().blocks[1]?.off).toBeUndefined();
    expect(script().blocks[3]?.off).toBeUndefined();
    scriptKey('z');
    expect(script().blocks[1]?.off).toBe(true);
  });

  it('turns selected lines off and on from the line menu and the toolbar, undoably', () => {
    const { script, root } = editorFixture([{ command: 'cube' }, { command: 'sphere' }, { command: 'cylinder' }]);
    chip(1).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    const item = (label: string) =>
      [...document.querySelectorAll<HTMLElement>('[role="menuitem"], button')].find(
        (entry) => entry.textContent?.trim() === label,
      );
    expect(item('Turn Off')).toBeDefined();
    item('Turn Off')!.click();
    expect(script().blocks[1]?.off).toBe(true);
    press(chip(1), 'ArrowDown', { shiftKey: true });
    const toolbar = [...root.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Off / On',
    );
    toolbar!.click();
    expect(script().blocks.map((block) => block.off === true)).toEqual([false, true, true]);
    toolbar!.click();
    expect(script().blocks.map((block) => block.off === true)).toEqual([false, false, false]);
    scriptKey('z');
    expect(script().blocks.map((block) => block.off === true)).toEqual([false, true, true]);
  });

  it('keeps the scroll, the current line, the selection and the focus when another user edits the script', () => {
    vi.useFakeTimers();
    try {
      const { node, stepId, script } = editorFixture(Array.from({ length: 60 }, () => ({ command: 'cube' })));
      const scroller = find('.solid-script-editor-lines');
      scroller.scrollTop = 4 + 20 * 24 + 5;
      chip(25).focus();
      press(chip(25), 'ArrowDown', { shiftKey: true });
      scroller.scrollLeft = 30;
      const selected = () =>
        [...document.querySelectorAll<HTMLElement>('.solid-script-editor-selected[data-line]')].map(
          (row) => row.dataset['line'],
        );
      expect(selected()).toEqual(['25']);
      const caretId = script().blocks[26]!.id;
      const remote = script();
      const added = solidScriptDocumentCreate([{ command: 'sphere' }, { command: 'sphere' }, { command: 'sphere' }]);
      remote.blocks.splice(40, 1);
      remote.blocks.unshift(...added.blocks);
      modifierStackParametersCommit(node, stepId, { script: remote }, null);
      vi.advanceTimersByTime(400);
      expect(scroller.scrollTop).toBe(4 + 23 * 24 + 5);
      expect(scroller.scrollLeft).toBe(30);
      const focused = (document.activeElement as HTMLElement).closest<HTMLElement>('[data-line]');
      expect(focused?.dataset['line']).toBe('29');
      expect(script().blocks[29]!.id).toBe(caretId);
      expect(selected()).toEqual(['28']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('tells the user when another user deletes the line they are configuring, and stores nothing', () => {
    vi.useFakeTimers();
    try {
      const { node, stepId, script, root } = editorFixture([{ command: 'cube' }, { command: 'sphere' }]);
      doubleClick(chip(0));
      expect(document.querySelector('[data-solid-script-configurator="cube"]')).not.toBeNull();
      const remote = script();
      remote.blocks.splice(0, 1);
      modifierStackParametersCommit(node, stepId, { script: remote }, null);
      vi.advanceTimersByTime(400);
      expect(root.textContent).toContain('Someone else deleted the line you are changing');
      expect(document.querySelector('[data-solid-script-configurator="cube"]')).not.toBeNull();
      tool('OK').click();
      expect(script().blocks.map((block) => block.command)).toEqual(['sphere']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows how often each line ran beside it', () => {
    editorFixture([
      { command: 'repeat', values: { variable: 'i', from: '1', to: '5' } },
      { command: 'cube', values: { size: '0.2, 0.2, 0.2' } },
      { command: 'end' },
      { command: 'sphere' },
    ]);
    const runs = (line: number) => find(`[data-line="${line}"] .solid-script-editor-runs`);
    expect(runs(1).textContent).toBe('×5');
    expect(runs(1).title).toMatch(/^Ran 5 times/);
    expect(runs(0).textContent).toBe('');
    expect(runs(3).textContent).toBe('');
    expect(runs(3).title).toMatch(/^Ran once/);
  });

  it('explains the selected line in the help panel with every value and hint', () => {
    const { root } = editorFixture([{ command: 'cylinder', values: { h: '4' } }]);
    chip(0).focus();
    const help = find('.solid-script-editor-help');
    expect(help.textContent).toContain('Cylinder');
    expect(help.textContent).toContain('Height along Y in metres.');
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

  it('runs an empty block and shows a warning in the output that leads to its line', () => {
    const { root } = editorFixture([{ command: 'cube' }, { command: 'texture' }, { command: 'end' }]);
    const output = find('.solid-script-editor-output-text');
    expect(output.classList.contains('solid-script-editor-output-error')).toBe(false);
    expect(output.textContent).toMatch(/^1 solid/);
    const warning = find('.solid-script-editor-output-warning');
    expect(warning.textContent).toBe('⚠️ Line 2: Texture has nothing inside, so it does nothing.');
    expect(root.querySelector('[data-line="1"]')?.classList.contains('solid-script-editor-failed')).toBe(false);
    warning.querySelector<HTMLButtonElement>('button')!.click();
    expect(document.activeElement).toBe(chip(1));
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

  it('runs to the line at the cursor with Ctrl+F10, inside blocks too', () => {
    const { root, node, stepId } = editorFixture([
      { command: 'cube' },
      { command: 'repeat', values: { variable: 'i', from: '0', to: '2', step: '1' } },
      { command: 'sphere' },
      { command: 'end' },
      { command: 'cylinder' },
      { command: 'note', values: { text: 'done' } },
    ]);
    chip(4).focus();
    press(chip(4), 'F10', { ctrlKey: true });
    expect(solidScriptDebugStepLimit(node, stepId)).toBe(5);
    expect(root.querySelector('.solid-script-editor-stepped')?.getAttribute('data-line')).toBe('4');
    chip(1).focus();
    press(chip(1), 'F10', { ctrlKey: true });
    expect(solidScriptDebugStepLimit(node, stepId)).toBe(2);
    chip(5).focus();
    press(chip(5), 'F10', { ctrlKey: true });
    expect(root.textContent).toContain('Line 6 builds no solid');
    expect(solidScriptDebugStepLimit(node, stepId)).toBe(2);
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
    field.focus();
    type(field, '[');
    const list = document.querySelector<HTMLElement>('.solid-script-editor-suggestions');
    expect(list?.classList.contains('editor-custom-scroller')).toBe(true);
  });

  it('sets Can Be Used As and the author in the Settings tab, undone with the script', () => {
    const { script } = editorFixture(CUBE_SPHERE);
    find<HTMLButtonElement>('[role="tab"][data-tab="settings"]').click();
    const settings = find<HTMLElement>('[data-solid-script-settings]');
    expect(settings.closest('[hidden]')).toBeNull();
    const generator = find<HTMLInputElement>('[data-solid-script-settings] [data-solid-script-use="generator"]');
    const modifier = find<HTMLInputElement>('[data-solid-script-settings] [data-solid-script-use="modifier"]');
    expect([generator.checked, modifier.checked]).toEqual([true, false]);
    modifier.checked = true;
    modifier.dispatchEvent(new Event('change'));
    expect(script().uses).toEqual({ generator: true, modifier: true });
    generator.checked = false;
    generator.dispatchEvent(new Event('change'));
    expect(generator.checked).toBe(true);
    const author = find<HTMLInputElement>('[data-solid-script-settings] input[aria-label="Author"]');
    author.value = ' Ada ';
    author.dispatchEvent(new Event('change'));
    expect(script().author).toBe('Ada');
    scriptKey('z');
    expect(script().author).toBeUndefined();
    expect(author.value).toBe('');
  });

  it('opens the suggestions on the page above every window, inside the page edges', () => {
    editorFixture(CUBE_SPHERE);
    doubleClick(chip(0));
    const field = document.querySelector<HTMLInputElement>('[data-solid-script-configurator] input[type="text"]')!;
    const window = field.closest<HTMLElement>('[data-solid-script-configurator]')!;
    field.getBoundingClientRect = () => new DOMRect(900, globalThis.innerHeight - 40, 120, 24);
    field.focus();
    type(field, '[');
    const host = document.querySelector<HTMLElement>('body > .solid-script-editor-suggestions-host')!;
    expect(window.contains(host)).toBe(false);
    expect(host.style.top).toBe('');
    expect(host.style.maxHeight).toBe(`${globalThis.innerHeight - 40 - 8}px`);
    expect(Number.parseFloat(host.style.left) + Number.parseFloat(host.style.width)).toBeLessThanOrEqual(
      globalThis.innerWidth - 4,
    );
    expect(Number.parseFloat(host.style.width)).toBeGreaterThanOrEqual(Math.min(560, globalThis.innerWidth - 8));
  });

  it('warns after a pause, without running, where a modifier would read Box values', async () => {
    const { root } = editorFixture(CUBE_SPHERE);
    const output = () => root.querySelector('.solid-script-editor-output-text')?.textContent ?? '';
    find<HTMLButtonElement>('[role="tab"][data-tab="settings"]').click();
    const modifier = find<HTMLInputElement>('[data-solid-script-settings] [data-solid-script-use="modifier"]');
    modifier.checked = true;
    modifier.dispatchEvent(new Event('change'));
    doubleClick(chip(0));
    const size = find<HTMLInputElement>('[data-solid-script-configurator="cube"] input[type="text"]');
    type(size, '[Box.Width], 1, 1');
    tool('OK').click();
    expect(output()).not.toContain('If Used As Generator');
    await new Promise((resolve) => setTimeout(resolve, SOLID_SCRIPT_EDITOR_CHECK_DELAY_MS + 50));
    expect(output()).toContain('Line 1');
    expect(output()).toContain('If Used As Generator');
  });

  it('offers the shape Names of the script in the Of field', () => {
    editorFixture([
      { command: 'cube', values: { label: 'Knob' } },
      { command: 'sphere', values: { label: 'Handle' } },
      { command: 'select_faces' },
    ]);
    doubleClick(chip(2));
    const of = find<HTMLInputElement>('[data-solid-script-configurator="select_faces"] input[aria-label="Of"]');
    of.focus();
    of.click();
    const shown = [...document.querySelectorAll('body > .solid-script-editor-suggestions-host [role="option"]')].map(
      (option) => option.firstChild?.textContent,
    );
    expect(shown.slice(0, 2)).toEqual(['Knob', 'Handle']);
    expect(chip(0).textContent).toContain('Named Knob');
  });

  it('suggests the counters and loop values a line sees, and only inside their loop', () => {
    editorFixture([
      { command: 'repeat', values: { variable: 'Row' } },
      { command: 'for_each_selected_face' },
      { command: 'cube' },
      { command: 'end' },
      { command: 'end' },
      { command: 'echo' },
    ]);
    const offered = (line: number): string[] => {
      doubleClick(chip(line));
      const field = document.querySelector<HTMLInputElement>('[data-solid-script-configurator] input[type="text"]')!;
      field.focus();
      type(field, '[');
      const shown = [...document.querySelectorAll('body > .solid-script-editor-suggestions-host [role="option"]')].map(
        (option) => option.firstChild?.textContent ?? '',
      );
      press(field, 'Escape');
      press(document.querySelector<HTMLElement>('[data-solid-script-configurator]') ?? field, 'Escape');
      return shown;
    };
    const inside = offered(2);
    expect(inside).toContain('Row');
    expect(inside).toContain('Face.Index');
    expect(inside).toContain('Face.Tag');
    const after = offered(5);
    expect(after).not.toContain('Row');
    expect(after).not.toContain('Face.Index');
  });

  it('offers the words a field takes first, shows the call being typed and browses the words too', () => {
    editorFixture([{ command: 'cube' }, { command: 'select_faces' }]);
    doubleClick(chip(1));
    const which = find<HTMLInputElement>('[data-solid-script-configurator="select_faces"] input[aria-label="Which"]');
    which.focus();
    which.click();
    const options = () =>
      [...document.querySelectorAll('body > .solid-script-editor-suggestions-host [role="option"]')].map(
        (option) => option.firstChild?.textContent,
      );
    expect(options().slice(0, 3)).toEqual(['All', 'Facing Up', 'Facing Down']);
    type(which, 'Bi');
    expect(options()).toEqual(['Biggest']);
    press(which, 'Enter');
    expect(which.value).toBe('Biggest');
    const detail = find<HTMLInputElement>('[data-solid-script-configurator="select_faces"] input[aria-label="Detail"]');
    detail.focus();
    type(detail, '[=Max(2, ');
    const hint = find('.solid-script-editor-suggestion-signature');
    expect(hint.querySelector('strong')?.textContent).toBe('B: Number');
    expect(hint.textContent).toBe(
      'Max(A: Number or List, B: Number, ...: Number) -> Number' +
        'B: Number. Another number.' +
        'The biggest number, of the inputs or of one list.',
    );
    expect(options()).toContain('Box.Width');
    const how = find<HTMLInputElement>('[data-solid-script-configurator="select_faces"] input[aria-label="How"]');
    how.focus();
    how.click();
    expect(find('[aria-label="Suggestions"] .solid-script-editor-suggestion-heading').textContent).toBe('Choices');
    const add = [...document.querySelectorAll<HTMLElement>('[aria-label="Suggestions"] [role="option"]')].find(
      (option) => option.firstChild?.textContent === 'Add',
    )!;
    add.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(how.value).toBe('Add');
    expect(document.activeElement).toBe(how);
    tool('Cancel').click();
  });

  it('suggests a Function its own locals, and no locals outside it', () => {
    editorFixture([
      { command: 'function', values: { name: 'lift', parameters: 'h' } },
      { command: 'return', values: { value: '1' } },
      { command: 'end' },
      { command: 'cube' },
    ]);
    const offered = (line: number): string[] => {
      doubleClick(chip(line));
      const field = document.querySelector<HTMLInputElement>('[data-solid-script-configurator] input[type="text"]')!;
      field.value = '[';
      field.setSelectionRange(1, 1);
      field.dispatchEvent(new Event('input'));
      const names = [...document.querySelectorAll<HTMLElement>('.solid-script-editor-suggestions [role="option"]')].map(
        (row) => row.firstElementChild?.textContent ?? '',
      );
      tool('Cancel').click();
      return names;
    };
    expect(offered(1)).toContain('Local.h');
    expect(offered(3)).not.toContain('Local.h');
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
    expect(explorerRows()).toEqual(['Local.h|3|Whole Number|1']);
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
    // Built-in values whose name or detail holds the search show too.
    expect(explorerRows().filter((row) => !row.endsWith('Read Only|'))).toEqual(['label|Big Hall|Text|3,4']);
    expect(explorerRows()).toContain('Run.Context|preview|Text · Read Only|');
    press(search, 'Escape');
    expect(explorerRows()).toHaveLength(5);
    find<HTMLButtonElement>(
      '.solid-script-editor-explorer-row[data-name="label"] .solid-script-editor-explorer-line:last-child',
    ).click();
    expect(document.activeElement).toBe(chip(3));
    // The explorer only watches values; picking them happens in the windows of the lines.
    expect(document.querySelector('.solid-script-editor-explorer button[aria-label^="Insert"]')).toBeNull();
    expect(find('.solid-script-editor-explorer').innerHTML).not.toMatch(/insert/i);
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

  it('opens a command the help mentions in the palette, clearing the search only when it hides the command', () => {
    editorFixture([{ command: 'cube' }]);
    const search = find<HTMLInputElement>('.solid-script-editor-palette-search');
    const highlighted = () => find('.solid-script-editor-palette-highlighted').dataset['command'];
    const title = () => find('.solid-script-editor-help-title').textContent;
    type(search, 'logic');
    find<HTMLElement>('.solid-script-editor-palette-item[data-command="if"]').focus();
    expect(title()).toBe('If');
    find<HTMLAnchorElement>('.solid-script-editor-help a[data-command="else"]').click();
    expect(search.value).toBe('logic');
    expect(highlighted()).toBe('else');
    expect(title()).toBe('Else');
    find<HTMLElement>('.solid-script-editor-palette-item[data-command="repeat"]').focus();
    find<HTMLAnchorElement>('.solid-script-editor-help a[data-command="translate"]').click();
    expect(search.value).toBe('');
    expect(highlighted()).toBe('translate');
    expect(title()).toBe('Translate');
    expect(find('.solid-script-editor-palette-item[data-command="translate"]').hidden).toBe(false);
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

  it('starts a new script, and opens a searched example as a new script, both undoable', async () => {
    const { commands, script, root } = editorFixture(CUBE_SPHERE);
    tool('New').click();
    expect(commands()).toEqual(['cube']);
    expect(root.textContent).toContain('New script.');
    scriptKey('z');
    expect(commands()).toEqual(['cube', 'sphere']);
    tool('Examples…').click();
    await settle();
    const dialog = find('[data-solid-script-examples]');
    expect(dialog.textContent).toContain('Showcase');
    expect(dialog.textContent).toContain('Built-In Generators');
    type(find<HTMLInputElement>('[data-solid-script-examples] input'), 'torus');
    expect([...dialog.querySelectorAll('[data-solid-script-example]')].map((row) => row.textContent)).toEqual([
      'Torus',
    ]);
    tool('Open').click();
    await settle();
    expect(script().name).toBe('Torus');
    expect(commands()).toContain('polyhedron');
    scriptKey('z');
    expect(commands()).toEqual(['cube', 'sphere']);
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
