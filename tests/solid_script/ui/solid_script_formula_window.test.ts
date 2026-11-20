import { afterEach, describe, expect, it, vi } from 'vitest';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import { SolidScriptConfigurator } from '@/solid_script/ui/solid_script_configurator.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from '@/solid_script/ui/solid_script_editor_css.js';
import { SOLID_SCRIPT_EDITOR_SIZE } from '@/solid_script/ui/solid_script_editor_frame.js';
import { SOLID_SCRIPT_EDITOR_TIP_DELAY_MS } from '@/solid_script/ui/solid_script_editor_tip.js';
import {
  SOLID_SCRIPT_EDITOR_BOUNDS_KEY,
  SOLID_SCRIPT_EDITOR_SIZES_KEY,
  SOLID_SCRIPT_FORMULA_BOUNDS_KEY,
  SOLID_SCRIPT_FORMULA_SIZES_KEY,
} from '@/solid_script/ui/solid_script_editor_splitters.js';

/** The Where of the Pebbles tutorial. */
const PEBBLES =
  '[=HitsBox([$Face], Vector(0, 0.2, 0), Vector(4, 0.3, 4), "Fully Inside") and InBox([$Face.Center], Vector(0, 0.2, 0), 1)]';

/**
 * Opens the configurator of a Select Faces line.
 *
 * @param where Where text.
 * @returns What OK stored, the window root and the Where input.
 */
function selectFaces(where: string) {
  const command = solidScriptCommandFind('select_faces');
  if (!command) throw new Error('Expected Select Faces');
  const stored: Record<string, string>[] = [];
  const window = new SolidScriptConfigurator(document.body, command, { which: 'All', where }, (values) =>
    stored.push(values),
  );
  window.show();
  const root = document.querySelector<HTMLElement>('[data-solid-script-configurator="select_faces"]');
  const input = document.querySelector<HTMLInputElement>('input[aria-label="Where"]');
  if (!root || !input) throw new Error('Expected the Where field');
  return { stored, root, input };
}

/**
 * Opens the formula window of the Where field.
 *
 * @returns Formula window root.
 */
function formulaOpen(): HTMLElement {
  button('Build Where from blocks').click();
  return formulaWindow();
}

/** Formula window root. */
function formulaWindow(): HTMLElement {
  const root = document.querySelector<HTMLElement>('[data-solid-script-formula="Where"]');
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
function button(name: string, within: ParentNode = document): HTMLButtonElement {
  const found = [...within.querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) => candidate.getAttribute('aria-label') === name || candidate.textContent === name,
  );
  if (!found) throw new Error(`Expected the ${name} button`);
  return found;
}

/** The formula shown under the help of the window. */
function preview(): HTMLElement {
  const found = formulaWindow().querySelector<HTMLElement>('[role="textbox"][aria-readonly="true"]');
  if (!found) throw new Error('Expected the formula text');
  return found;
}

/**
 * The formula as the window shows it.
 *
 * @returns Text.
 */
function formulaText(): string {
  return preview().textContent ?? '';
}

/**
 * The block on a line of the formula window.
 *
 * @param line Line index.
 * @returns Block element.
 */
function chip(line: number): HTMLElement {
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
function press(element: HTMLElement, key: string, init: KeyboardEventInit = {}): void {
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
function drag(element: Element, type: string, data: Record<string, string>, init: MouseEventInit = {}): void {
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
function paletteDrop(id: string, line: number): void {
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
function rows(): string[] {
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
function fieldFill(id: string, label: string, value: string): void {
  const block = document.querySelector<HTMLElement>(`[data-solid-script-configurator="${id}"]`);
  if (!block) throw new Error(`Expected the window of ${id}`);
  const field = block.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`);
  if (!field) throw new Error(`Expected the field ${label}`);
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  button('OK', block).click();
}

/** Status line of the formula window. */
function status(): string {
  return formulaWindow().querySelector(`.${SOLID_SCRIPT_EDITOR_CLASSES.formulaStatus}`)?.textContent ?? '';
}

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
});

describe('SolidScript formula window', () => {
  it('opens from the … button beside the textbox, over the configurator, darkening only it', () => {
    const { root } = selectFaces(PEBBLES);
    const backdrops = document.querySelectorAll<HTMLElement>('.editor-message-box-backdrop');
    expect(backdrops).toHaveLength(1);
    const window = formulaOpen();
    expect(formulaText()).toBe(
      'HitsBox([$Face], Vector(0, 0.2, 0), Vector(4, 0.3, 4), "Fully Inside") and InBox([$Face.Center], Vector(0, 0.2, 0), 1)',
    );
    expect(rows()).toHaveLength(2);
    expect(root.querySelector(`.${SOLID_SCRIPT_EDITOR_CLASSES.shade}`)).not.toBeNull();
    expect(window.querySelector(`.${SOLID_SCRIPT_EDITOR_CLASSES.shade}`)).toBeNull();
    const all = [...document.querySelectorAll<HTMLElement>('.editor-message-box-backdrop')];
    expect(all).toHaveLength(2);
    expect(all[1]?.style.background).toBe('transparent');
    expect(all[0]?.style.background).not.toBe('transparent');
  });

  it('opens a block in the shared configurator over the formula window, with the face as a placeholder', () => {
    selectFaces(PEBBLES);
    const window = formulaOpen();
    press(chip(1), 'Enter');
    const block = document.querySelector<HTMLElement>('[data-solid-script-configurator="formula_check_in_box"]');
    expect(block).not.toBeNull();
    const point = block!.querySelector<HTMLInputElement>('input[aria-label="Point"]')!;
    expect(point.value).toBe('');
    expect(point.placeholder).toBe('[$Face.Center]');
    expect(block!.querySelector<HTMLInputElement>('input[aria-label="Center"]')!.value).toBe('0, 0.2, 0');
    expect(window.querySelector(`.${SOLID_SCRIPT_EDITOR_CLASSES.shade}`)).not.toBeNull();
    const size = block!.querySelector<HTMLInputElement>('input[aria-label="Size"]')!;
    size.value = '2';
    size.dispatchEvent(new Event('input', { bubbles: true }));
    button('OK', block!).click();
    expect(window.querySelector(`.${SOLID_SCRIPT_EDITOR_CLASSES.shade}`)).toBeNull();
    expect(formulaText()).toBe(
      'HitsBox([$Face], Vector(0, 0.2, 0), Vector(4, 0.3, 4), "Fully Inside") and InBox([$Face.Center], Vector(0, 0.2, 0), 2)',
    );
  });

  it('writes the formula into the field on OK, wrapped once', () => {
    const { input, root } = selectFaces(PEBBLES);
    formulaOpen();
    press(chip(0), 'Delete');
    paletteDrop('formula_value', 0);
    fieldFill('formula_value', 'Expression', '[$NY] > 0.5');
    press(chip(4), 'Delete');
    expect(rows()).toEqual(['More Than', 'Variable [$NY]', "Number '0.5'", 'End More Than']);
    button('OK', formulaWindow()).click();
    expect(input.value).toBe('[=[$NY] > 0.5]');
    expect(root.querySelector(`.${SOLID_SCRIPT_EDITOR_CLASSES.shade}`)).toBeNull();
    button('Build Where from blocks').click();
    expect(formulaText()).toBe('[$NY] > 0.5');
    button('OK', formulaWindow()).click();
    expect(input.value).toBe('[=[$NY] > 0.5]');
  });

  it('changes nothing on Cancel, after many edits and drags', () => {
    const { input, stored, root } = selectFaces(PEBBLES);
    formulaOpen();
    paletteDrop('formula_or', 0);
    paletteDrop('formula_equals', 1);
    paletteDrop('formula_number', 2);
    fieldFill('formula_number', 'Number', '5, 2, 7');
    press(chip(0), 'Delete');
    press(chip(1), 'ArrowDown', { ctrlKey: true, shiftKey: true });
    paletteDrop('formula_not', 0);
    paletteDrop('formula_check_is_face', 1);
    press(chip(0), 'Delete');
    expect(formulaText()).not.toBe(PEBBLES);
    button('Cancel', formulaWindow()).click();
    expect(document.querySelector('[data-solid-script-formula]')).toBeNull();
    expect(input.value).toBe(PEBBLES);
    expect(root.querySelector(`.${SOLID_SCRIPT_EDITOR_CLASSES.shade}`)).toBeNull();
    button('OK', root).click();
    expect(stored[0]?.['where']).toBe(PEBBLES);
  });

  it('builds groups closed by End, the blocks inside indented', () => {
    selectFaces('[=[$NY] > 0.5 || [$NX] > 0.5]');
    formulaOpen();
    expect(rows()).toEqual([
      'Or',
      'More Than',
      'Variable [$NY]',
      "Number '0.5'",
      'End More Than',
      'More Than',
      'Variable [$NX]',
      "Number '0.5'",
      'End More Than',
      'End Or',
    ]);
    const indent = (line: number) => Number.parseFloat(chip(line).style.paddingLeft);
    expect(indent(1)).toBeGreaterThan(indent(0));
    expect(indent(2)).toBeGreaterThan(indent(1));
    expect(indent(9)).toBe(indent(0));
    paletteDrop('formula_equals', 9);
    expect(status()).toMatch(/Equals needs at least 2 blocks inside/);
    paletteDrop('formula_variable', 10);
    fieldFill('formula_variable', 'Variable', '$Index');
    paletteDrop('formula_fn_abs', 11);
    paletteDrop('formula_number', 12);
    fieldFill('formula_number', 'Number', '-3');
    expect(formulaText()).toBe('[$NY] > 0.5 || [$NX] > 0.5 || [$Index] == Abs(-3)');
    expect(status()).not.toMatch(/Line/);
  });

  it('shows a value as the block that fits it once it is written', () => {
    selectFaces('[=[$Face.Center] == 2]');
    formulaOpen();
    press(chip(2), 'Enter');
    fieldFill('formula_number', 'Number', '5, 2, 7');
    expect(formulaText()).toBe('[$Face.Center] == [5, 2, 7]');
    expect(rows()[2]).toBe("Vector '5, 2, 7'");
    press(chip(2), 'Enter');
    const vector = document.querySelector<HTMLElement>('[data-solid-script-configurator="formula_vector"]')!;
    expect(vector.querySelector<HTMLInputElement>('input[aria-label="Vector"]')!.value).toBe('5, 2, 7');
    button('Cancel', vector).click();
    press(chip(1), 'Enter');
    fieldFill('formula_variable', 'Variable', '"Top"');
    expect(rows()[1]).toBe("Text 'Top'");
  });

  it('refuses OK while the blocks have a mistake, keeping the last formula greyed', () => {
    const { input } = selectFaces('[=[a] || [b]]');
    formulaOpen();
    press(chip(3), 'Delete');
    expect(status()).toMatch(/Or has no End/);
    expect(preview().classList.contains(SOLID_SCRIPT_EDITOR_CLASSES.formulaOff)).toBe(true);
    expect(formulaText()).toBe('[a] || [b]');
    button('OK', formulaWindow()).click();
    expect(status()).toMatch(/^Fix the formula first/);
    button('Cancel', formulaWindow()).click();
    expect(input.value).toBe('[=[a] || [b]]');
  });

  it('names a function with too few inputs on its line, and the blocks can fix it', () => {
    const { input } = selectFaces('[=Clamp([a], 0) > 0]');
    formulaOpen();
    expect(rows().slice(0, 4)).toEqual(['More Than', 'Clamp', 'Variable [a]', "Number '0'"]);
    expect(status()).toBe('Line 2: Clamp needs at least 3 blocks inside.');
    button('OK', formulaWindow()).click();
    expect(status()).toMatch(/^Fix the formula first: Line 2: Clamp/);
    paletteDrop('formula_number', 4);
    fieldFill('formula_number', 'Number', '1');
    expect(formulaText()).toBe('Clamp([a], 0, 1) > 0');
    expect(status()).not.toMatch(/Line/);
    button('OK', formulaWindow()).click();
    expect(input.value).toBe('[=Clamp([a], 0, 1) > 0]');
  });

  it('tells you to fix a broken formula before it opens', () => {
    const { root } = selectFaces('[=[$NY] > ]');
    button('Build Where from blocks').click();
    expect(document.querySelector('[data-solid-script-formula]')).toBeNull();
    expect(root.textContent).toMatch(/Fix the formula first: /);
  });

  it('searches its own palette of named blocks and keeps its own favorites', () => {
    selectFaces('');
    const window = formulaOpen();
    const search = window.querySelector<HTMLInputElement>('input[placeholder]')!;
    expect(search.placeholder).toMatch(/block/i);
    search.value = 'box';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    const shown = [...window.querySelectorAll<HTMLElement>('.solid-script-editor-palette-item')]
      .filter((item) => !item.hidden)
      .map((item) => item.dataset['command']);
    expect(shown).toContain('formula_check_in_box');
    expect(shown).toContain('formula_check_hits_box');
    expect(shown).not.toContain('formula_or');
  });

  it('shows the help of the selected block above a highlighted formula that can only be copied', () => {
    selectFaces(PEBBLES);
    const window = formulaOpen();
    const title = () => window.querySelector(`.${SOLID_SCRIPT_EDITOR_CLASSES.helpTitle}`)?.textContent;
    chip(1).dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true }));
    expect(title()).toBe('In Box');
    expect(window.querySelector(`.${SOLID_SCRIPT_EDITOR_CLASSES.help}`)?.textContent).toMatch(/Point/);
    expect(preview().querySelector('input, textarea')).toBeNull();
    expect(preview().tabIndex).toBe(0);
    const kinds = [...preview().querySelectorAll('span')].flatMap((span) => [...span.classList]);
    expect(kinds).toContain(SOLID_SCRIPT_EDITOR_CLASSES.tokenFunction);
    expect(kinds).toContain(SOLID_SCRIPT_EDITOR_CLASSES.tokenNumber);
    expect(kinds).toContain(SOLID_SCRIPT_EDITOR_CLASSES.tokenString);
    expect(kinds).toContain(SOLID_SCRIPT_EDITOR_CLASSES.tokenSystem);
  });

  it('puts Cancel and OK next to each other on the right', () => {
    selectFaces('');
    const row = button('OK', formulaOpen()).parentElement!;
    const names = [...row.children].map((child) => child.textContent);
    expect(names.slice(-2)).toEqual(['Cancel', 'OK']);
    expect((row.children[row.children.length - 3] as HTMLElement).style.flex).toBe('1 1 0%');
  });

  it('opens at the script editor size and keeps its own layout apart from the script editor', () => {
    const editor = JSON.stringify({ left: 5, top: 6, width: 700, height: 400 });
    localStorage.setItem(SOLID_SCRIPT_EDITOR_BOUNDS_KEY, editor);
    selectFaces('');
    let window = formulaOpen();
    expect(window.style.width).toBe(`${SOLID_SCRIPT_EDITOR_SIZE.width}px`);
    expect(window.style.height).toBe(`${SOLID_SCRIPT_EDITOR_SIZE.height}px`);
    window.getBoundingClientRect = () => ({ left: 30, top: 40, width: 800, height: 500 }) as DOMRect;
    const grip = window.querySelector('[aria-label="Resize panel"]')!;
    grip.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 1, clientY: 1 }));
    globalThis.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
    const splitter = window.querySelector<HTMLElement>('[role="separator"]')!;
    splitter.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 100 }));
    globalThis.dispatchEvent(new MouseEvent('pointermove', { clientX: 130 }));
    globalThis.dispatchEvent(new MouseEvent('pointerup'));
    expect(JSON.parse(localStorage.getItem(SOLID_SCRIPT_FORMULA_BOUNDS_KEY)!)).toEqual({
      left: 30,
      top: 40,
      width: 800,
      height: 500,
    });
    expect(JSON.parse(localStorage.getItem(SOLID_SCRIPT_FORMULA_SIZES_KEY)!).palette).toBe(206);
    expect(localStorage.getItem(SOLID_SCRIPT_EDITOR_BOUNDS_KEY)).toBe(editor);
    expect(localStorage.getItem(SOLID_SCRIPT_EDITOR_SIZES_KEY)).toBeNull();
    button('Cancel', window).click();
    window = formulaOpen();
    expect(window.style.width).toBe('800px');
    expect(window.querySelector<HTMLElement>('.solid-script-editor-palette')!.style.width).toBe('206px');
  });

  it('shows the formula of a hovered block, and of a whole group on the group or its End, highlighted', () => {
    vi.useFakeTimers();
    selectFaces('[=[$NY] > 0.5 || HasTag([$Face.Tags], "Top")]');
    formulaOpen();
    const tipOf = (line: number) => {
      chip(line).dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      vi.advanceTimersByTime(SOLID_SCRIPT_EDITOR_TIP_DELAY_MS);
      return document.querySelector<HTMLElement>(`.${SOLID_SCRIPT_EDITOR_CLASSES.codeTipText}`);
    };
    expect(rows()[0]).toBe('Or');
    expect(tipOf(0)?.textContent).toBe('[$NY] > 0.5 || HasTag([$Face.Tags], "Top")');
    expect(tipOf(rows().length - 1)?.textContent).toBe('[$NY] > 0.5 || HasTag([$Face.Tags], "Top")');
    expect(tipOf(1)?.textContent).toBe('[$NY] > 0.5');
    const leaf = tipOf(3)!;
    expect(leaf.textContent).toBe('0.5');
    expect(leaf.querySelector(`.${SOLID_SCRIPT_EDITOR_CLASSES.tokenNumber}`)).not.toBeNull();
    const check = tipOf(5)!;
    expect(check.textContent).toBe('HasTag([$Face.Tags], "Top")');
    expect(check.querySelector(`.${SOLID_SCRIPT_EDITOR_CLASSES.tokenString}`)?.textContent).toBe('"Top"');
    vi.useRealTimers();
  });
});
