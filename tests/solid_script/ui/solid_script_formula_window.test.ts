import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SolidScriptCommandParameter } from '@/solid_script/commands/solid_script_command.js';
import { SOLID_SCRIPT_COMMAND_CATALOG } from '@/solid_script/commands/solid_script_command_catalog.js';
import { SOLID_SCRIPT_FORMULA_LEAVES } from '@/solid_script/commands/solid_script_formula_commands.js';
import { solidScriptConfiguratorFormulaCapable } from '@/solid_script/ui/solid_script_configurator_fields.js';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptParameterValueStored } from '@/solid_script/commands/solid_script_parameter_default.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from '@/solid_script/ui/solid_script_editor_css.js';
import { SOLID_SCRIPT_EDITOR_SIZE } from '@/solid_script/ui/solid_script_editor_frame.js';
import { solidScriptEditorViewRead, solidScriptEditorViewWrite } from '@/solid_script/ui/solid_script_editor_view.js';
import { SOLID_SCRIPT_EDITOR_TIP_DELAY_MS } from '@/solid_script/ui/solid_script_editor_tip.js';
import {
  SOLID_SCRIPT_EDITOR_BOUNDS_KEY,
  SOLID_SCRIPT_EDITOR_SIZES_KEY,
  SOLID_SCRIPT_FORMULA_BOUNDS_KEY,
  SOLID_SCRIPT_FORMULA_SIZES_KEY,
} from '@/solid_script/ui/solid_script_editor_splitters.js';
import {
  configuratorOpen,
  selectFaces,
  formulaOpen,
  formulaWindow,
  button,
  preview,
  formulaText,
  chip,
  press,
  paletteDrop,
  rows,
  fieldFill,
  status,
} from './solid_script_formula_window_fixture.js';

/** The Where of the Pebbles tutorial. */
const PEBBLES =
  '[=HitsBox([$Face], Vector(0, 0.2, 0), Vector(4, 0.3, 4), "Fully Inside") and InBox([$Face.Center], Vector(0, 0.2, 0), 1)]';

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
      '[=HitsBox([$Face], Vector(0, 0.2, 0), Vector(4, 0.3, 4), "Fully Inside") and InBox([$Face.Center], Vector(0, 0.2, 0), 1)]',
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
      '[=HitsBox([$Face], Vector(0, 0.2, 0), Vector(4, 0.3, 4), "Fully Inside") and InBox([$Face.Center], Vector(0, 0.2, 0), 2)]',
    );
  });

  it('writes the formula into the field on OK, wrapped once', () => {
    const { input, root } = selectFaces(PEBBLES);
    formulaOpen();
    press(chip(0), 'Delete');
    paletteDrop('formula_value', 0);
    fieldFill('formula_value', 'Expression', '[$NY] > 0.5');
    press(chip(1), 'Delete');
    expect(rows()).toEqual(["Expression '[$NY] > 0.5'"]);
    button('OK', formulaWindow()).click();
    expect(input.value).toBe('[=[$NY] > 0.5]');
    expect(root.querySelector(`.${SOLID_SCRIPT_EDITOR_CLASSES.shade}`)).toBeNull();
    button('Build Where from blocks').click();
    expect(formulaText()).toBe('[=[$NY] > 0.5]');
    expect(rows()).toEqual(['Greater Than', 'Variable [$NY]', "Number '0.5'", 'End Greater Than']);
    button('OK', formulaWindow()).click();
    expect(input.value).toBe('[=[$NY] > 0.5]');
  });

  it('changes nothing on Cancel, after many edits and drags', () => {
    const { input, stored, root } = selectFaces(PEBBLES);
    formulaOpen();
    const before = rows();
    paletteDrop('formula_or', 0);
    paletteDrop('formula_equals', 1);
    paletteDrop('formula_number', 2);
    fieldFill('formula_number', 'Number', '5, 2, 7');
    press(chip(0), 'Delete');
    press(chip(1), 'ArrowDown', { ctrlKey: true, shiftKey: true });
    paletteDrop('formula_not', 0);
    paletteDrop('formula_check_is_face', 1);
    press(chip(0), 'Delete');
    expect(rows()).not.toEqual(before);
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
      'Greater Than',
      'Variable [$NY]',
      "Number '0.5'",
      'End Greater Than',
      'Greater Than',
      'Variable [$NX]',
      "Number '0.5'",
      'End Greater Than',
      'End Or',
    ]);
    const indent = (line: number) => Number.parseFloat(chip(line).style.paddingLeft);
    expect(indent(1)).toBeGreaterThan(indent(0));
    expect(indent(2)).toBeGreaterThan(indent(1));
    expect(indent(9)).toBe(indent(0));
    paletteDrop('formula_equals', 9);
    expect(status()).toMatch(/Equals needs at least 2 parts/);
    paletteDrop('formula_variable', 10);
    fieldFill('formula_variable', 'Variable', '$Index');
    paletteDrop('formula_fn_abs', 11);
    paletteDrop('formula_number', 12);
    fieldFill('formula_number', 'Number', '-3');
    expect(formulaText()).toBe('[=[$NY] > 0.5 || [$NX] > 0.5 || [$Index] == Abs(-3)]');
    expect(status()).not.toMatch(/Line/);
  });

  it('keeps a block as it was dropped while editing, reading the formula into fitting blocks only on opening', () => {
    selectFaces('[=[$Face.Center] == 2]');
    formulaOpen();
    press(chip(2), 'Enter');
    fieldFill('formula_number', 'Number', '5, 2, 7');
    expect(formulaText()).toBe('[=[$Face.Center] == [5, 2, 7]]');
    expect(rows()[2]).toBe("Number '5, 2, 7'");
    press(chip(1), 'Enter');
    fieldFill('formula_variable', 'Variable', '"Top"');
    expect(rows()[1]?.startsWith('Variable')).toBe(true);
    button('OK', formulaWindow()).click();
    formulaOpen();
    expect(rows().slice(1, 3)).toEqual(["Text 'Top'", "Vector '5, 2, 7'"]);
    press(chip(2), 'Enter');
    const vector = document.querySelector<HTMLElement>('[data-solid-script-configurator="formula_vector"]')!;
    expect(vector.querySelector<HTMLInputElement>('input[aria-label="Vector"]')!.value).toBe('5, 2, 7');
  });

  it('refuses OK while the blocks have a mistake, keeping the last formula greyed', () => {
    const { input } = selectFaces('[=[a] || [b]]');
    formulaOpen();
    press(chip(3), 'Delete');
    expect(status()).toMatch(/Or has no End/);
    expect(preview().classList.contains(SOLID_SCRIPT_EDITOR_CLASSES.formulaOff)).toBe(true);
    expect(formulaText()).toBe('[=[a] || [b]]');
    button('OK', formulaWindow()).click();
    expect(status()).toMatch(/^Fix the formula first/);
    button('Cancel', formulaWindow()).click();
    expect(input.value).toBe('[=[a] || [b]]');
  });

  it('names a function with too few inputs on its line, and the blocks can fix it', () => {
    const { input } = selectFaces('[=Clamp([a], 0) > 0]');
    formulaOpen();
    expect(rows().slice(0, 4)).toEqual(['Greater Than', 'Clamp', 'Variable [a]', "Number '0'"]);
    expect(status()).toBe('Line 2: Clamp needs at least 3 parts.');
    button('OK', formulaWindow()).click();
    expect(status()).toMatch(/^Fix the formula first: Line 2: Clamp/);
    paletteDrop('formula_number', 4);
    fieldFill('formula_number', 'Number', '1');
    expect(formulaText()).toBe('[=Clamp([a], 0, 1) > 0]');
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
    expect(tipOf(0)?.textContent).toBe('[=[$NY] > 0.5 || HasTag([$Face.Tags], "Top")]');
    expect(tipOf(rows().length - 1)?.textContent).toBe('[=[$NY] > 0.5 || HasTag([$Face.Tags], "Top")]');
    expect(tipOf(1)?.textContent).toBe('[=[$NY] > 0.5]');
    const leaf = tipOf(3)!;
    expect(leaf.textContent).toBe('0.5');
    expect(leaf.querySelector(`.${SOLID_SCRIPT_EDITOR_CLASSES.tokenNumber}`)).not.toBeNull();
    const check = tipOf(5)!;
    expect(check.textContent).toBe('[=HasTag([$Face.Tags], "Top")]');
    expect(check.querySelector(`.${SOLID_SCRIPT_EDITOR_CLASSES.tokenString}`)?.textContent).toBe('"Top"');
    vi.useRealTimers();
  });

  it('adds an If with its Then, Else and End, as the script editor adds a block with its End', () => {
    selectFaces('[=[$NY] > 0]');
    formulaOpen();
    paletteDrop('formula_if', 0);
    expect(rows().slice(0, 4)).toEqual(['If', 'Then', 'Else', 'End If']);
    expect(status()).toMatch(/^Line 1: If needs at least one part/);
  });

  it('opens a plain choice as a Text block offering the words of the field, and writes it back plain', () => {
    const { input } = configuratorOpen('group', { mode: 'Subtractive' }, 'Mode');
    button('Build Mode from blocks').click();
    expect(rows()).toEqual(["Text 'Subtractive'"]);
    expect(formulaText()).toBe('Subtractive');
    press(chip(0), 'Enter');
    const text = document.querySelector<HTMLElement>('[data-solid-script-configurator="formula_text"]')!;
    const field = text.querySelector<HTMLInputElement>('input[aria-label="Text"]')!;
    field.value = '';
    field.focus();
    field.dispatchEvent(new Event('input', { bubbles: true }));
    const offered = [...document.querySelectorAll('[role="option"]')].map((row) => row.firstElementChild?.textContent);
    expect(offered).toEqual(expect.arrayContaining(['Additive', 'Subtractive', 'Intersecting']));
    field.value = 'Sideways';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    expect(text.textContent).toMatch(/must be Additive, .* not "Sideways"/);
    fieldFill(T, 'Text', 'Intersecting');
    button('OK', formulaWindow()).click();
    expect(input.value).toBe('Intersecting');
  });

  it('opens an Anchor as a List of a Text per axis, each offering the axis words and warning about others', () => {
    const { input } = configuratorOpen('cube', { anchor: 'Center, Center, Center' }, 'Anchor');
    button('Build Anchor from blocks').click();
    press(chip(1), 'Enter');
    const text = document.querySelector<HTMLElement>('[data-solid-script-configurator="formula_text"]')!;
    const field = text.querySelector<HTMLInputElement>('input[aria-label="Text"]')!;
    field.value = '';
    field.focus();
    field.dispatchEvent(new Event('input', { bubbles: true }));
    const offered = [...document.querySelectorAll('[role="option"]')].map((row) => row.firstElementChild?.textContent);
    expect(offered).toEqual(expect.arrayContaining(['Left', 'Center', 'Right', 'Bottom', 'Top', 'Back', 'Front']));
    expect(offered).not.toContain('Center, Center, Center');
    field.value = 'Middle';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    expect(text.textContent).toMatch(/must be .*, not "Middle"/);
    fieldFill(T, 'Text', 'Left');
    button('OK', formulaWindow()).click();
    expect(input.value).toBe('Left, Center, Center');
  });

  it('shows End alone with the Block Names On End view switch off, writing the same formula', () => {
    solidScriptEditorViewWrite({ ...solidScriptEditorViewRead(), endNames: false });
    const { input } = selectFaces('[=[$Face.Center.Y] > 0]');
    formulaOpen();
    expect(rows()).toEqual(['Greater Than', 'Variable [$Face.Center.Y]', "Number '0'", 'End']);
    press(chip(2), 'Enter');
    fieldFill('formula_number', 'Number', '1');
    button('OK', formulaWindow()).click();
    expect(input.value).toBe('[=[$Face.Center.Y] > 1]');
  });

  it('keeps several selected blocks after OK of the window Enter opens, and gives the focus back on Escape', () => {
    const { input } = selectFaces('[=[$Face.Center.Y] > 0]');
    const opener = button('Build Where from blocks');
    opener.focus();
    opener.click();
    chip(1).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    chip(2).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, shiftKey: true }));
    chip(2).focus();
    press(chip(2), 'Enter');
    fieldFill('formula_number', 'Number', '1');
    const marks = [SOLID_SCRIPT_EDITOR_CLASSES.selected, SOLID_SCRIPT_EDITOR_CLASSES.current];
    const selected = () =>
      [...formulaWindow().querySelectorAll<HTMLElement>('[data-line]')]
        .filter((row) => marks.some((mark) => row.classList.contains(mark)))
        .map((row) => Number(row.dataset['line']));
    expect(selected()).toEqual([1, 2]);
    expect(document.activeElement).toBe(chip(2));
    press(chip(2), 'Enter');
    const field = document.querySelector<HTMLInputElement>('[data-solid-script-configurator="formula_number"] input')!;
    field.focus();
    press(field, 'Escape');
    expect(document.activeElement).toBe(chip(2));
    expect(selected()).toEqual([1, 2]);
    press(chip(2), 'Escape');
    expect(document.querySelector('[data-solid-script-formula]')).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(input.value).toBe('[=[$Face.Center.Y] > 0]');
  });

  it('keeps a choice made by a formula as a formula, its Text blocks offering the words too', () => {
    const choice = '[=4 > 2 ? "Subtractive" : "Additive"]';
    const { input } = configuratorOpen('group', { mode: choice }, 'Mode');
    button('Build Mode from blocks').click();
    const words = rows().filter((row) => row.startsWith('Text'));
    expect(words).toEqual(["Text 'Subtractive'", "Text 'Additive'"]);
    press(chip(rows().indexOf("Text 'Additive'")), 'Enter');
    fieldFill(T, 'Text', 'Intersecting');
    button('OK', formulaWindow()).click();
    expect(input.value).toBe('[=4 > 2 ? "Subtractive" : "Intersecting"]');
  });
});

/** A change made to one block of a formula, and the field text it writes. */
interface FieldEdit {
  /** Line of the block. */
  line: number;
  /** Command id of the block. */
  block: string;
  /** Value typed into the block. */
  value: string;
  /** Field text written on OK. */
  written: string;
}

/** A field of one kind holding a typical value, and how the blocks open it. */
interface FieldCase {
  /** Kind of field this case stands for. */
  kind: string;
  /** Command id of the line. */
  id: string;
  /** Caption of the field. */
  label: string;
  /** Field text. */
  stored: string;
  /** Blocks the formula window shows. */
  blocks: string[];
  /** The change to make, when one is tried. */
  edit?: FieldEdit;
}

/**
 * Makes the change of a field case to one value block.
 *
 * @param line Line of the block.
 * @param block Command id of the block.
 * @param value Value typed.
 * @param written Field text written on OK.
 * @returns Change.
 */
function edit(line: number, block: string, value: string, written: string): FieldEdit {
  return { line, block, value, written };
}

/** The Text block. */
const T = 'formula_text';

/**
 * Typical values of every kind of field, as people type them, and one value
 * block written as a formula, which a change writes back in the field's own
 * plain form, such as 3, 3, 3 for a Vector block in a Size.
 */
const FIELD_CASES: readonly FieldCase[] = [
  {
    kind: 'vector3',
    id: 'cube',
    label: 'Size',
    stored: '2, 2, 2',
    blocks: ["Vector '2, 2, 2'"],
    edit: edit(0, 'formula_vector', '3, 2, 1', '3, 2, 1'),
  },
  {
    kind: 'vector3',
    id: 'cube',
    label: 'Size',
    stored: '1, [W], 1',
    blocks: ["Vector '1, [W], 1'"],
    edit: edit(0, 'formula_vector', '1, [W], 2', '1, [W], 2'),
  },
  {
    kind: 'vector3',
    id: 'cube',
    label: 'Size',
    stored: '0, [=[W] * 2], 0',
    blocks: [
      'Vector',
      "Number '0'",
      'Multiply',
      'Variable [W]',
      "Number '2'",
      'End Multiply',
      "Number '0'",
      'End Vector',
    ],
    edit: edit(4, 'formula_number', '3', '0, [=[W] * 3], 0'),
  },
  {
    kind: 'vector3',
    id: 'cube',
    label: 'Size',
    stored: '[=Vector(1, 2, 3)]',
    blocks: ["Vector '1, 2, 3'"],
    edit: edit(0, 'formula_vector', '4, 5, 6', '4, 5, 6'),
  },
  {
    kind: 'vector2',
    id: 'square',
    label: 'Size',
    stored: '1, 2',
    blocks: ["Vector '1, 2'"],
    edit: edit(0, 'formula_vector', '1, 3', '1, 3'),
  },
  {
    kind: 'number',
    id: 'sphere',
    label: 'Radius',
    stored: '1.5',
    blocks: ["Number '1.5'"],
    edit: edit(0, 'formula_number', '3', '3'),
  },
  { kind: 'number', id: 'sphere', label: 'Radius', stored: '-2', blocks: ["Number '-2'"] },
  {
    kind: 'number',
    id: 'sphere',
    label: 'Radius',
    stored: '[=[Radius] * 2]',
    blocks: ['Multiply', 'Variable [Radius]', "Number '2'", 'End Multiply'],
    edit: edit(2, 'formula_number', '3', '[=[Radius] * 3]'),
  },
  {
    kind: 'count',
    id: 'sphere',
    label: 'Sides',
    stored: '16',
    blocks: ["Number '16'"],
    edit: edit(0, 'formula_number', '8', '8'),
  },
  {
    kind: 'text',
    id: 'cube',
    label: 'Name',
    stored: 'Big Box',
    blocks: ["Text 'Big Box'"],
    edit: edit(0, T, 'Small Box', 'Small Box'),
  },
  {
    kind: 'message',
    id: 'sphere',
    label: 'Mode',
    stored: 'Subtractive',
    blocks: ["Text 'Subtractive'"],
    edit: edit(0, T, 'Additive', 'Additive'),
  },
  {
    kind: 'text',
    id: 'select_faces',
    label: 'Which',
    stored: 'Facing Up',
    blocks: ["Text 'Facing Up'"],
    edit: edit(0, T, 'All', 'All'),
  },
  { kind: 'boolean', id: 'path', label: 'Closed', stored: 'Yes', blocks: ["Text 'Yes'"], edit: edit(0, T, 'No', 'No') },
  {
    kind: 'name',
    id: 'call',
    label: 'Function',
    stored: 'Area',
    blocks: ["Text 'Area'"],
    edit: edit(0, T, 'Volume', 'Volume'),
  },
  {
    kind: 'variable',
    id: 'sphere',
    label: 'Radius',
    stored: '[Radius]',
    blocks: ['Variable [Radius]'],
    edit: edit(0, 'formula_variable', 'Size', '[Size]'),
  },
  {
    kind: 'value',
    id: 'for_each',
    label: 'In',
    stored: '1, 2, 3, 4',
    blocks: ['List', "Number '1'", "Number '2'", "Number '3'", "Number '4'", 'End List'],
    edit: edit(2, 'formula_number', '5', '1, 5, 3, 4'),
  },
  {
    kind: 'value',
    id: 'for_each',
    label: 'In',
    stored: 'Red, Green',
    blocks: ['List', "Text 'Red'", "Text 'Green'", 'End List'],
  },
  {
    kind: 'value',
    id: 'transform',
    label: 'On',
    stored: '[Top], [Side]',
    blocks: ['List', 'Variable [Top]', 'Variable [Side]', 'End List'],
  },
  {
    kind: 'points3',
    id: 'path',
    label: 'Points',
    stored: '[0, 0, 0], [1, 0, 0], [1, 1, 0]',
    blocks: ['List', "Vector '0, 0, 0'", "Vector '1, 0, 0'", "Vector '1, 1, 0'", 'End List'],
    edit: edit(2, 'formula_vector', '2, 0, 0', '[0, 0, 0], [2, 0, 0], [1, 1, 0]'),
  },
  { kind: 'points3', id: 'place_at_points', label: 'At', stored: '0, 0, 0', blocks: ["Vector '0, 0, 0'"] },
  {
    kind: 'points2',
    id: 'polygon',
    label: 'Points From List',
    stored: '[0, 0], [1, 0], [0, 1]',
    blocks: ['List', "Vector '0, 0'", "Vector '1, 0'", "Vector '0, 1'", 'End List'],
  },
  {
    kind: 'where',
    id: 'select_faces',
    label: 'Where',
    stored: '[=[$Face.Center.Y] > 0]',
    blocks: ['Greater Than', 'Variable [$Face.Center.Y]', "Number '0'", 'End Greater Than'],
    edit: edit(2, 'formula_number', '1', '[=[$Face.Center.Y] > 1]'),
  },
  { kind: 'where', id: 'select_faces', label: 'Where', stored: PEBBLES, blocks: [] },
  {
    kind: 'condition',
    id: 'if',
    label: 'Condition',
    stored: '[I] % 2 == 0',
    blocks: ['Equals', 'Remainder', 'Variable [I]', "Number '2'", 'End Remainder', "Number '0'", 'End Equals'],
    edit: edit(5, 'formula_number', '1', '[I] % 2 == 1'),
  },
  {
    kind: 'slots',
    id: 'echo',
    label: 'Message',
    stored: 'Hi [Name]!',
    blocks: ['Text Of', "Text 'Hi '", 'Variable [Name]', "Text '!'", 'End Text Of'],
    edit: edit(3, T, '?', 'Hi [Name]?'),
  },
  {
    kind: 'slots',
    id: 'echo',
    label: 'Message',
    stored: '[Turn] / [Steps] + 9',
    blocks: ['Text Of', 'Variable [Turn]', "Text ' / '", 'Variable [Steps]', "Text ' + 9'", 'End Text Of'],
    edit: edit(1, 'formula_variable', 'Turns', '[Turns] / [Steps] + 9'),
  },
  { kind: 'slots', id: 'echo', label: 'Message', stored: 'Box$, big', blocks: ["Text 'Box, big'"] },
  { kind: 'slots', id: 'echo', label: 'Message', stored: '$[Box$] is', blocks: ["Text '$[Box$] is'"] },
  { kind: 'message', id: 'echo', label: 'Message', stored: '[=""]', blocks: ["Text ''"], edit: edit(0, T, 'Hi', 'Hi') },
  {
    kind: 'message',
    id: 'echo',
    label: 'Message',
    stored: '[="a"]',
    blocks: ["Text 'a'"],
    edit: edit(0, T, '', '[=""]'),
  },
  { kind: 'empty', id: 'cube', label: 'Name', stored: '', blocks: [] },
  { kind: 'empty', id: 'sphere', label: 'Radius', stored: '', blocks: [] },
  {
    kind: 'vector3',
    id: 'cube',
    label: 'Size',
    stored: '[=[2, 2, 2]]',
    blocks: ["Vector '2, 2, 2'"],
    edit: edit(0, 'formula_vector', '3, 3, 3', '3, 3, 3'),
  },
  {
    kind: 'vector2',
    id: 'square',
    label: 'Size',
    stored: '[=Vector(1, 2)]',
    blocks: ["Vector '1, 2'"],
    edit: edit(0, 'formula_vector', '3, 4', '3, 4'),
  },
  {
    kind: 'points3',
    id: 'place_at_points',
    label: 'At',
    stored: '[=[0, 0, 0]]',
    blocks: ["Vector '0, 0, 0'"],
    edit: edit(0, 'formula_vector', '1, 2, 3', '1, 2, 3'),
  },
  {
    kind: 'points2',
    id: 'polygon',
    label: 'Points From List',
    stored: '[=$[[0, 0], [1, 0], [0, 1]$]]',
    blocks: ['List', "Vector '0, 0'", "Vector '1, 0'", "Vector '0, 1'", 'End List'],
    edit: edit(2, 'formula_vector', '2, 0', '[0, 0], [2, 0], [0, 1]'),
  },
  {
    kind: 'value',
    id: 'for_each',
    label: 'In',
    stored: '[=[1, 2, 3]]',
    blocks: ["Vector '1, 2, 3'"],
    edit: edit(0, 'formula_vector', '4, 5, 6', '4, 5, 6'),
  },
  {
    kind: 'number',
    id: 'sphere',
    label: 'Radius',
    stored: '[=5]',
    blocks: ["Number '5'"],
    edit: edit(0, 'formula_number', '6', '6'),
  },
  {
    kind: 'count',
    id: 'sphere',
    label: 'Sides',
    stored: '[=16]',
    blocks: ["Number '16'"],
    edit: edit(0, 'formula_number', '8', '8'),
  },
  {
    kind: 'text',
    id: 'cube',
    label: 'Name',
    stored: '[="Big"]',
    blocks: ["Text 'Big'"],
    edit: edit(0, T, 'Small', 'Small'),
  },
  {
    kind: 'message',
    id: 'sphere',
    label: 'Mode',
    stored: '[="Subtractive"]',
    blocks: ["Text 'Subtractive'"],
    edit: edit(0, T, 'Intersecting', 'Intersecting'),
  },
  {
    kind: 'boolean',
    id: 'path',
    label: 'Closed',
    stored: '[="Yes"]',
    blocks: ["Text 'Yes'"],
    edit: edit(0, T, 'No', 'No'),
  },
  {
    kind: 'name',
    id: 'call',
    label: 'Function',
    stored: '[="Area"]',
    blocks: ["Text 'Area'"],
    edit: edit(0, T, 'Volume', 'Volume'),
  },
  {
    kind: 'variable',
    id: 'sphere',
    label: 'Radius',
    stored: '[=[Radius]]',
    blocks: ['Variable [Radius]'],
    edit: edit(0, 'formula_variable', 'Size', '[Size]'),
  },
  {
    kind: 'anchor',
    id: 'cube',
    label: 'Anchor',
    stored: 'Center, Center, Center',
    blocks: ['List', "Text 'Center'", "Text 'Center'", "Text 'Center'", 'End List'],
    edit: edit(2, T, 'Bottom', 'Center, Bottom, Center'),
  },
  {
    kind: 'anchor',
    id: 'linear_extrude',
    label: 'Anchor',
    stored: 'Top',
    blocks: ["Text 'Top'"],
    edit: edit(0, T, 'Bottom', 'Bottom'),
  },
  {
    kind: 'texture',
    id: 'texture_faces',
    label: 'Texture',
    stored: 'grass',
    blocks: ["Text 'grass'"],
    edit: edit(0, T, 'stone', 'stone'),
  },
];

/**
 * Opens the formula window of a field case.
 *
 * @param field Field case.
 * @returns The field's input.
 */
function fieldOpen(field: FieldCase): HTMLInputElement {
  const { input } = configuratorOpen(field.id, { [solidScriptFieldOf(field).key]: field.stored }, field.label);
  button(`Build ${field.label} from blocks`).click();
  return input;
}

/**
 * Finds the field of a case in the catalog.
 *
 * @param field Field case.
 * @returns Field.
 */
function solidScriptFieldOf(field: FieldCase): SolidScriptCommandParameter {
  const parameter = solidScriptCommandFind(field.id)?.parameters.find((each) => each.label === field.label);
  if (!parameter) throw new Error(`Expected ${field.id} ${field.label}`);
  return parameter;
}

/**
 * Returns the text the formula window stores for a field: empty when it equals
 * the declared default.
 *
 * @param field Field case.
 * @param text Written or unchanged field text.
 * @returns Text stored in the field.
 */
function solidScriptFieldStored(field: FieldCase, text: string): string {
  return solidScriptParameterValueStored(text, solidScriptFieldOf(field).default);
}

describe('SolidScript formula window on every kind of field', () => {
  it.each(FIELD_CASES.map((field) => [field.kind, field.stored, field] as const))(
    'opens %s %j as its blocks, previewing exactly what OK keeps',
    (_kind, stored, field) => {
      const input = fieldOpen(field);
      if (field.blocks.length > 0) expect(rows()).toEqual(field.blocks);
      expect(rows().length > 0).toBe(stored.trim() !== '');
      expect(status()).not.toMatch(/^Line \d|plain text/);
      const shown = formulaText();
      button('OK', formulaWindow()).click();
      expect(document.querySelector('[data-solid-script-formula]')).toBeNull();
      expect(input.value).toBe(solidScriptFieldStored(field, stored));
      expect(input.value).toBe(solidScriptFieldStored(field, shown));
    },
  );

  it.each(FIELD_CASES.map((field) => [field.kind, field.stored, field] as const))(
    'leaves %s %j as it was on Cancel, even after a change',
    (_kind, stored, field) => {
      const input = fieldOpen(field);
      if (field.edit) {
        press(chip(field.edit.line), 'Enter');
        fieldFill(field.edit.block, solidScriptFormulaLeafLabel(field.edit.block), field.edit.value);
      }
      button('Cancel', formulaWindow()).click();
      expect(input.value).toBe(stored);
    },
  );

  it.each(FIELD_CASES.filter((field) => field.edit).map((field) => [field.kind, field.stored, field] as const))(
    'writes a change to %s %j back the way the field is typed, as the preview shows it',
    (_kind, _stored, field) => {
      const input = fieldOpen(field);
      const change = field.edit!;
      press(chip(change.line), 'Enter');
      fieldFill(change.block, solidScriptFormulaLeafLabel(change.block), change.value);
      expect(formulaText()).toBe(change.written);
      button('OK', formulaWindow()).click();
      expect(input.value).toBe(solidScriptFieldStored(field, change.written));
    },
  );

  it('has a case for every kind of field the blocks can build', () => {
    const tested = new Set<string>(FIELD_CASES.map((field) => solidScriptFieldOf(field).type));
    const kinds = new Set<string>();
    for (const command of SOLID_SCRIPT_COMMAND_CATALOG.commands)
      for (const parameter of command.parameters)
        if (solidScriptConfiguratorFormulaCapable(parameter)) kinds.add(parameter.type);
    expect([...kinds].filter((kind) => !tested.has(kind))).toEqual([]);
    expect(new Set(FIELD_CASES.map((field) => field.kind)).size).toBeGreaterThanOrEqual(kinds.size);
  });
});

/**
 * Finds the caption of the field of a value block.
 *
 * @param block Command id of the block.
 * @returns Caption, such as Number.
 */
function solidScriptFormulaLeafLabel(block: string): string {
  const label = SOLID_SCRIPT_FORMULA_LEAVES.find((leaf) => leaf.id === block)?.label;
  if (!label) throw new Error(`Expected the block ${block}`);
  return label;
}
