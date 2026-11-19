import * as THREE from 'three';
import { CommandStack } from '@/commands/command_stack.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { MODIFIER_STACK_SOLID_SCRIPT_KIND } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';
import { modifierStackParametersCommit } from '@/modifier/stack/modifier_stack_parameters_commit.js';
import type { ModifierStackActionTarget } from '@/modifier/stack/modifier_stack_types.js';
import {
  solidScriptDocumentCreate,
  solidScriptDocumentNormalize,
  type SolidScriptDocument,
  type SolidScriptLine,
} from '@/solid_script/document/solid_script_document.js';
import { solidScriptEditorOpen } from '@/solid_script/ui/solid_script_editor_open.js';

/**
 * Opens the editor of a generator holding a script.
 *
 * @param lines Command lines of the script.
 * @returns Fixture parts.
 */
export function editorFixture(lines: SolidScriptLine[]) {
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
