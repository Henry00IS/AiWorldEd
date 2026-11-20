import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import { SolidScriptConfigurator } from '@/solid_script/ui/solid_script_configurator.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from '@/solid_script/ui/solid_script_editor_css.js';

/**
 * Opens the configurator of a line.
 *
 * @param id Command id.
 * @param values Stored values.
 * @param label Caption of the field to find.
 * @returns What OK stored, the window root and the field's input.
 */
export function configuratorOpen(id: string, values: Record<string, string>, label: string) {
  const command = solidScriptCommandFind(id);
  if (!command) throw new Error(`Expected ${id}`);
  const stored: Record<string, string>[] = [];
  new SolidScriptConfigurator(document.body, command, values, (written) => stored.push(written)).show();
  const root = document.querySelector<HTMLElement>(`[data-solid-script-configurator="${id}"]`);
  const input = root?.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!root || !input) throw new Error(`Expected the ${label} field`);
  return { stored, root, input };
}

/**
 * Opens the configurator of a Select Faces line.
 *
 * @param where Where text.
 * @returns What OK stored, the window root and the Where input.
 */
export function selectFaces(where: string) {
  return configuratorOpen('select_faces', { which: 'All', where }, 'Where');
}

/**
 * Opens the formula window of the Where field.
 *
 * @returns Formula window root.
 */
export function formulaOpen(): HTMLElement {
  button('Build Where from blocks').click();
  return formulaWindow();
}

/** Formula window root. */
export function formulaWindow(): HTMLElement {
  const root = document.querySelector<HTMLElement>('[data-solid-script-formula]');
  if (!root) throw new Error('Expected the formula window');
  return root;
}

/**
 * Finds a button by its accessible name or text.
 *
 * @param name Name.
 * @param within Element to search in.
 * @returns Button.
 */
export function button(name: string, within: ParentNode = document): HTMLButtonElement {
  const found = [...within.querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) => candidate.getAttribute('aria-label') === name || candidate.textContent === name,
  );
  if (!found) throw new Error(`Expected the ${name} button`);
  return found;
}

/** The formula shown under the help of the window. */
export function preview(): HTMLElement {
  const found = formulaWindow().querySelector<HTMLElement>('[role="textbox"][aria-readonly="true"]');
  if (!found) throw new Error('Expected the formula text');
  return found;
}

/**
 * The formula as the window shows it.
 *
 * @returns Text.
 */
export function formulaText(): string {
  return preview().textContent ?? '';
}

/**
 * The block on a line of the formula window.
 *
 * @param line Line index.
 * @returns Block element.
 */
export function chip(line: number): HTMLElement {
  const found = formulaWindow().querySelector<HTMLElement>(
    `[data-line="${line}"] .${SOLID_SCRIPT_EDITOR_CLASSES.chip}`,
  );
  if (!found) throw new Error(`Expected line ${line}`);
  return found;
}

/**
 * Presses a key on an element.
 *
 * @param element Element.
 * @param key Key.
 * @param init Modifier keys.
 */
export function press(element: HTMLElement, key: string, init: KeyboardEventInit = {}): void {
  element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
}

/**
 * Sends a drag event with data shared by the whole drag.
 *
 * @param element Target.
 * @param type Event type.
 * @param data Shared drag data.
 * @param init Pointer position.
 */
export function drag(element: Element, type: string, data: Record<string, string>, init: MouseEventInit = {}): void {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientY: -1, ...init });
  Object.defineProperty(event, 'dataTransfer', {
    value: {
      get types() {
        return Object.keys(data);
      },
      files: [],
      getData: (kind: string) => data[kind] ?? '',
      setData: (kind: string, value: string) => void (data[kind] = value),
      dropEffect: 'none',
      effectAllowed: 'all',
    },
  });
  element.dispatchEvent(event);
}

/**
 * Drags a palette block onto a line of the formula.
 *
 * @param id Command id.
 * @param line Line it lands before.
 */
export function paletteDrop(id: string, line: number): void {
  const data: Record<string, string> = {};
  const favorites = formulaWindow().querySelector('.solid-script-editor-palette-favorites');
  const source = [
    ...formulaWindow().querySelectorAll<HTMLElement>(`.solid-script-editor-palette-item[data-command="${id}"]`),
  ].find((entry) => !favorites?.contains(entry));
  if (!source) throw new Error(`Expected ${id}`);
  const list = formulaWindow().querySelector<HTMLElement>('.solid-script-editor-lines')!;
  drag(source, 'dragstart', data);
  drag(list, 'dragenter', data, { relatedTarget: source });
  drag(chip(line), 'dragenter', data, { relatedTarget: list });
  drag(chip(line), 'dragover', data);
  drag(chip(line), 'drop', data);
  drag(source, 'dragend', data);
}

/**
 * Lists the commands of the formula's blocks, read from the rows.
 *
 * @returns Command ids per line.
 */
export function rows(): string[] {
  return [...formulaWindow().querySelectorAll<HTMLElement>(`[data-line] .${SOLID_SCRIPT_EDITOR_CLASSES.chip}`)].map(
    (row) => row.textContent ?? '',
  );
}

/**
 * Types into a field of the open block window and presses OK.
 *
 * @param id Command id of the block.
 * @param label Field caption.
 * @param value Typed text.
 */
export function fieldFill(id: string, label: string, value: string): void {
  const block = document.querySelector<HTMLElement>(`[data-solid-script-configurator="${id}"]`);
  if (!block) throw new Error(`Expected the window of ${id}`);
  const field = block.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`);
  if (!field) throw new Error(`Expected the field ${label}`);
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  button('OK', block).click();
}

/** Status line of the formula window. */
export function status(): string {
  return formulaWindow().querySelector(`.${SOLID_SCRIPT_EDITOR_CLASSES.formulaStatus}`)?.textContent ?? '';
}

/**
 * Drags the line under a block, with the other selected lines, onto another
 * line of the formula.
 *
 * @param from Line dragged.
 * @param line Line it lands before.
 */
export function lineDrop(from: number, line: number): void {
  const data: Record<string, string> = {};
  const row = chip(from).closest<HTMLElement>('[data-line]')!;
  drag(row, 'dragstart', data);
  drag(chip(line), 'dragenter', data, { relatedTarget: row });
  drag(chip(line), 'dragover', data);
  drag(chip(line), 'drop', data);
  drag(row, 'dragend', data);
}

/**
 * Selects the lines from the current one to another, as a Shift press does.
 *
 * @param first First line.
 * @param last Last line.
 */
export function linesSelect(first: number, last: number): void {
  chip(first).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
  chip(last).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, shiftKey: true }));
}
