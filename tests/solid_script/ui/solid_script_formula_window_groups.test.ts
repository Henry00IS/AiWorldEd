import { afterEach, describe, expect, it } from 'vitest';
import { SOLID_SCRIPT_EDITOR_CLASSES } from '@/solid_script/ui/solid_script_editor_css.js';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptFormulaOwnId } from '@/solid_script/commands/solid_script_formula_groups.js';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentNames } from '@/solid_script/document/solid_script_document_names.js';
import { SolidScriptConfigurator } from '@/solid_script/ui/solid_script_configurator.js';
import {
  button,
  chip,
  fieldFill,
  formulaOpen,
  formulaText,
  formulaWindow,
  lineDrop,
  linesSelect,
  paletteDrop,
  press,
  preview,
  rows,
  selectFaces,
  status,
} from './solid_script_formula_window_fixture.js';

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
});

/**
 * Drops a Variable block before a line and names it.
 *
 * @param line Line it lands before.
 * @param name Variable name.
 */
function variableDrop(line: number, name: string): void {
  paletteDrop('formula_variable', line);
  fieldFill('formula_variable', 'Variable', name);
}

/** Tells whether OK is refused, leaving the window open. */
function okRefused(): boolean {
  button('OK', formulaWindow()).click();
  return document.querySelector('[data-solid-script-formula]') !== null && /^Fix the formula first/.test(status());
}

describe('SolidScript formula window groups', () => {
  it('builds an And step by step, keeping it while it holds no part or one', () => {
    const { input } = selectFaces('[=[a]]');
    formulaOpen();
    paletteDrop('formula_and', 0);
    expect(rows()).toEqual(['And', 'End And', 'Variable [a]']);
    expect(status()).toBe('Line 1: And needs at least one part.');
    expect(preview().classList.contains(SOLID_SCRIPT_EDITOR_CLASSES.formulaOff)).toBe(true);
    expect(okRefused()).toBe(true);
    variableDrop(1, 'b');
    expect(rows()).toEqual(['And', 'Variable [b]', 'End And', 'Variable [a]']);
    expect(formulaText()).toBe('[=[b] && [a]]');
    expect(status()).not.toMatch(/Line/);
    variableDrop(2, 'c');
    expect(rows()).toEqual(['And', 'Variable [b]', 'Variable [c]', 'End And', 'Variable [a]']);
    expect(formulaText()).toBe('[=[b] && [c] && [a]]');
    button('OK', formulaWindow()).click();
    expect(input.value).toBe('[=[b] && [c] && [a]]');
  });

  it('takes several selected blocks dropped into a group at once', () => {
    selectFaces('[=[a] && [b] && [c]]');
    formulaOpen();
    paletteDrop('formula_or', 0);
    expect(rows()).toEqual(['Or', 'End Or', 'Variable [a]', 'Variable [b]', 'Variable [c]']);
    linesSelect(2, 3);
    lineDrop(2, 1);
    expect(rows()).toEqual(['Or', 'Variable [a]', 'Variable [b]', 'End Or', 'Variable [c]']);
    expect(formulaText()).toBe('[=([a] || [b]) && [c]]');
  });

  it('keeps a group as its parts are deleted down to one and none, Cancel leaving the field', () => {
    const { input, stored, root } = selectFaces('[=[a] || [b]]');
    formulaOpen();
    press(chip(2), 'Delete');
    expect(rows()).toEqual(['Or', 'Variable [a]', 'End Or']);
    expect(formulaText()).toBe('[a]');
    press(chip(1), 'Delete');
    expect(rows()).toEqual(['Or', 'End Or']);
    expect(status()).toBe('Line 1: Or needs at least one part.');
    expect(formulaText()).toBe('[a]');
    expect(okRefused()).toBe(true);
    button('Cancel', formulaWindow()).click();
    expect(input.value).toBe('[=[a] || [b]]');
    button('OK', root).click();
    expect(stored[0]?.['where']).toBe('[=[a] || [b]]');
  });

  it('saves a group of one part as that part', () => {
    const { input } = selectFaces('[=[a] || [b]]');
    formulaOpen();
    press(chip(1), 'Delete');
    expect(rows()).toEqual(['Or', 'Variable [b]', 'End Or']);
    button('OK', formulaWindow()).click();
    expect(input.value).toBe('[b]');
  });

  it('keeps Not and a function block while they are empty, naming what they need', () => {
    selectFaces('[=Abs([a]) > 1]');
    formulaOpen();
    expect(rows().slice(0, 3)).toEqual(['Greater Than', 'Absolute', 'Variable [a]']);
    press(chip(2), 'Delete');
    expect(rows().slice(0, 3)).toEqual(['Greater Than', 'Absolute', 'End Absolute']);
    expect(status()).toBe('Line 2: Absolute needs at least one part.');
    paletteDrop('formula_not', 2);
    expect(rows().slice(1, 5)).toEqual(['Absolute', 'Not', 'End Not', 'End Absolute']);
    expect(status()).toMatch(/needs at least one part/);
    variableDrop(3, 'b');
    expect(formulaText()).toBe('[=Abs(![b]) > 1]');
  });

  it('offers the Functions of the script among the functions, dropped like any function block', () => {
    const script = solidScriptDocumentCreate([
      { command: 'note', values: { text: 'Mixes two numbers.' } },
      { command: 'function', values: { name: 'Henry', parameters: 'A, B' } },
      { command: 'end' },
    ]);
    const stored: Record<string, string>[] = [];
    const names = solidScriptDocumentNames(script);
    const command = solidScriptCommandFind('select_faces')!;
    new SolidScriptConfigurator(
      document.body,
      command,
      { which: 'All', where: '[=[a]]' },
      (values) => {
        stored.push(values);
      },
      names,
    ).show();
    formulaOpen();
    const id = solidScriptFormulaOwnId('Henry');
    const item = formulaWindow().querySelector<HTMLElement>(`.solid-script-editor-palette-item[data-command="${id}"]`);
    expect(item?.title).toContain('Mixes two numbers.');
    paletteDrop(id, 0);
    expect(rows().slice(0, 2)).toEqual(['Henry', 'End Henry']);
    expect(status()).toBe('Line 1: Henry needs at least 2 parts.');
    variableDrop(1, 'b');
    variableDrop(2, 'c');
    expect(formulaText()).toBe('[=Henry([b], [c]) && [a]]');
  });
});
