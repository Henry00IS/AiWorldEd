import { afterEach, describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import {
  button,
  chip,
  configuratorOpen,
  fieldFill,
  formulaWindow,
  press,
  rows,
} from './solid_script_formula_window_fixture.js';

afterEach(() => document.body.replaceChildren());

/** Texts with $ signs, brackets, commas and spaces, as typed in a Text block. */
const TEXTS = [
  '$',
  '$$',
  '$ ',
  ' $',
  '$ $ $ ',
  '5, $ $ $ ',
  '$[',
  '$]',
  '$,',
  'a$',
  'a $',
  '$ a',
  'a$$b',
  'a$[b$]c',
  'a$,b',
  'a, b',
  '[x]',
  'a[b',
  'a"b',
  '$"',
  'x$$$',
  '  $  ',
];

/**
 * Where the Text block stands: the field it opens from, its line, and the
 * field's text around it.
 */
const PLACES = [
  { name: 'alone', field: 'x', line: 0, before: '', after: '' },
  { name: 'first in Text Of', field: '5, [0, 0, 0], 10', line: 1, before: '', after: '[0, 0, 0], 10' },
  { name: 'in the middle of Text Of', field: '[0, 0, 0]x[1, 1, 1]', line: 2, before: '[0, 0, 0]', after: '[1, 1, 1]' },
  { name: 'last in Text Of', field: '[0, 0, 0]x', line: 2, before: '[0, 0, 0]', after: '' },
];

/**
 * Runs an Echo of field text.
 *
 * @param value Field text.
 * @returns What it says.
 */
function echo(value: string): string | undefined {
  const lines: SolidScriptLine[] = [
    { command: 'echo', values: { value } },
    { command: 'cube', values: {} },
  ];
  return solidScriptProgramRun(solidScriptDocumentCreate(lines)).messages[0];
}

describe('SolidScript formula window Text blocks with $ signs', () => {
  it.each(PLACES.flatMap((place) => TEXTS.map((text) => ({ ...place, text }))))(
    'keeps the Text $text $name exactly: plain field text that runs and opens as the same blocks',
    ({ field, line, before, after, text }) => {
      const { input } = configuratorOpen('echo', { value: field }, 'Message');
      button('Build Message from blocks').click();
      press(chip(line), 'Enter');
      fieldFill('formula_text', 'Text', text);
      const blocks = rows();
      expect(blocks[line]).toBe(`Text '${text}'`);
      button('OK', formulaWindow()).click();
      expect(input.value.startsWith('[=')).toBe(false);
      expect(echo(input.value)).toBe(`${before}${text}${after}`);
      button('Build Message from blocks').click();
      expect(rows()).toEqual(blocks);
    },
  );

  it('writes Text Of with a first Text of 5, $ $ $  as plain field text, not [=Str(...)]', () => {
    const { input } = configuratorOpen('echo', { value: '5, [0, 0, 0], 10, 20, 30$ $ $ ' }, 'Message');
    button('Build Message from blocks').click();
    press(chip(1), 'Enter');
    fieldFill('formula_text', 'Text', '5, $ $ $ ');
    button('OK', formulaWindow()).click();
    expect(input.value).toBe('5, $ $ $ [0, 0, 0], 10, 20, 30$ $ $ ');
    button('Build Message from blocks').click();
    expect(rows()).toEqual([
      'Text Of',
      "Text '5, $ $ $ '",
      "Vector '0, 0, 0'",
      "Text ', 10, 20, 30   '",
      'End Text Of',
    ]);
  });
});
