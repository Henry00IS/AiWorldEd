import * as THREE from 'three';
import { CommandStack } from '@/commands/command_stack.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import {
  MODIFIER_STACK_SOLID_SCRIPT_KIND,
  MODIFIER_STACK_SOLID_SCRIPT_MODIFIER_KIND,
} from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';
import { modifierVolumeTemplateEntries } from '@/modifier/stack/modifier_volume_templates.js';
import { modifierStackParametersCommit } from '@/modifier/stack/modifier_stack_parameters_commit.js';
import type { ModifierStackActionTarget } from '@/modifier/stack/modifier_stack_types.js';
import {
  solidScriptDocumentCreate,
  solidScriptDocumentNormalize,
  type SolidScriptDocument,
  type SolidScriptLine,
  type SolidScriptUse,
} from '@/solid_script/document/solid_script_document.js';
import { solidScriptEditorCurrentGet, solidScriptEditorOpen } from '@/solid_script/ui/solid_script_editor_open.js';
import { projectFolderCurrentSet } from '@/project/fs/project_folder_current.js';

/**
 * Opens the editor of a SolidScript generator, or of a SolidScript modifier.
 *
 * @param lines Command lines of the script.
 * @param use Generator or modifier host.
 * @returns Fixture parts.
 */
export function editorFixture(lines: SolidScriptLine[], use: SolidScriptUse = 'generator') {
  const world = new THREE.Group();
  const node =
    use === 'modifier'
      ? ModifierVolume.create({
          modifiers: modifierVolumeTemplateEntries([MODIFIER_STACK_SOLID_SCRIPT_MODIFIER_KIND]),
        })
      : modifierGeneratorNodeCreate(MODIFIER_STACK_SOLID_SCRIPT_KIND);
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
  return { world, node, stepId, commandStack, root, script, commands, refreshes };
}

/**
 * Finds an element or fails.
 *
 * @param selector CSS selector.
 * @returns Element.
 */
export function find<T extends HTMLElement = HTMLElement>(selector: string): T {
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
export function chip(line: number): HTMLElement {
  return find(`[data-line="${line}"] .solid-script-editor-chip`);
}

/**
 * Double-clicks an element.
 *
 * @param element Element.
 */
export function doubleClick(element: HTMLElement): void {
  element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
}

/**
 * Presses a key on an element.
 *
 * @param element Element.
 * @param key Key.
 * @param modifiers Modifier keys.
 */
export function press(element: HTMLElement, key: string, modifiers: KeyboardEventInit = {}): void {
  element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers }));
}

/**
 * Reads the rows of the variable explorer as name|value|type|lines.
 *
 * @returns Rows.
 */
export function explorerRows(): string[] {
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

/**
 * Returns the button with a label.
 *
 * @param label Button text.
 * @returns Button.
 */
export function tool(label: string): HTMLButtonElement {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) => candidate.textContent === label,
  );
  if (!button) throw new Error(`Expected the ${label} button`);
  return button;
}

/**
 * Clicks a category of the variable explorer.
 *
 * @param category Category.
 */
export function categoryShow(category: string): void {
  find<HTMLButtonElement>(`[data-category="${category}"]`).click();
}

/**
 * Reads the caption above the variable table.
 *
 * @returns Caption.
 */
export function caption(): string {
  return find('.solid-script-editor-explorer-column .solid-script-editor-variables-caption').textContent ?? '';
}

/**
 * Presses a line with the left button.
 *
 * @param at Line index.
 */
export function linePress(at: number): void {
  chip(at).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
}

/** Lines of a script with a cube and a sphere. */
export const CUBE_SPHERE: SolidScriptLine[] = [{ command: 'cube' }, { command: 'sphere' }];

/**
 * Presses an undo or redo key in the script editor's lines.
 *
 * @param key Z or Y.
 * @param modifiers Extra modifier keys, such as Shift for Ctrl+Shift+Z.
 */
export function scriptKey(key: 'z' | 'y', modifiers: KeyboardEventInit = {}): void {
  press(find('[data-solid-script-editor] .solid-script-editor-lines'), key, { ctrlKey: true, ...modifiers });
}

/**
 * Types into an input.
 *
 * @param input Input.
 * @param value New text.
 */
export function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Drops drag data on an element.
 *
 * @param element Drop target.
 * @param data Drag data by type.
 */
export function drop(element: HTMLElement, data: Record<string, string>): void {
  const event = new MouseEvent('drop', { bubbles: true, cancelable: true, clientY: -1 });
  Object.defineProperty(event, 'dataTransfer', {
    value: { types: Object.keys(data), files: [], getData: (kind: string) => data[kind] ?? '' },
  });
  element.dispatchEvent(event);
}

/** Lets pending promises settle. */
export async function settle(): Promise<void> {
  for (let round = 0; round < 10; round++) await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Closes the open editor, forgets the project folder and empties the page after
 * a test.
 */
export function editorCleanup(): void {
  solidScriptEditorCurrentGet()?.close();
  projectFolderCurrentSet(null);
  document.body.replaceChildren();
}
