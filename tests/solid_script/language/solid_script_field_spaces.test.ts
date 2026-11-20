import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptFieldSpacesRead,
  solidScriptFieldSpacesWrite,
  solidScriptFieldTrim,
} from '@/solid_script/language/solid_script_field.js';
import { solidScriptFormulaBody, solidScriptFormulaStore } from '@/solid_script/language/solid_script_formula_field.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Runs a Message field and returns what it says, between < and >.
 *
 * @param field Field text.
 * @returns Message.
 */
function said(field: string): string {
  const run = solidScriptProgramRun(
    solidScriptDocumentCreate([
      { command: 'variable', values: { name: 'Turn', value: '1' } },
      { command: 'variable', values: { name: 'T', value: field } },
      { command: 'echo', values: { value: '[=Str("<", [T], ">")]' } },
    ]),
  );
  expect(run.error).toBeNull();
  return run.messages[0] ?? '';
}

describe('SolidScript field spaces', () => {
  it.each([
    ['leading', '$ Hi', ' Hi', '" Hi"'],
    ['trailing', 'Hi$ ', 'Hi ', '"Hi "'],
    ['both', '$ Hi$ ', ' Hi ', '" Hi "'],
    ['multiple', '$ $ Hi$ $ $ ', '  Hi   ', '"  Hi   "'],
    ['only spaces', '$ $ ', '  ', '"  "'],
    ['one space', '$ ', ' ', '" "'],
    ['spaces in the middle', '$ two  words$ ', ' two  words ', '" two  words "'],
    ['a part', '$ [Turn] / 9$ ', ' 1 / 9 ', 'Str(" ", [Turn], " / 9 ")'],
  ])('keeps %s: %j runs as %j and opens as %s, written back the same', (_case, field, runs, formula) => {
    expect(said(field)).toBe(`<${runs}>`);
    expect(solidScriptFormulaBody('text', field)).toBe(formula);
    expect(solidScriptFormulaStore('text', formula, '')).toBe(field);
    expect(solidScriptFieldSpacesRead(field)).toBe(field.includes('[') ? ' [Turn] / 9 ' : runs);
  });

  it.each([
    ['a $ and a space in the middle', 'a$ b', 'a$ b'],
    ['other escapes beside them', '$ $[a$]$$$,$ ', ' [a]$, '],
    ['a dollar sign before a kept space', '$$$ ', '$ '],
    ['an escaped dollar sign at the end', 'cost 5$$', 'cost 5$'],
  ])('reads %s: %j runs as %j', (_case, field, runs) => {
    expect(said(field)).toBe(`<${runs}>`);
  });

  it.each([
    ['  $ Hi$   ', '$ Hi$ '],
    ['Hi$ $   ', 'Hi$ $ '],
    ['  Hi  ', 'Hi'],
    ['Hi$$ ', 'Hi$$'],
    ['Hi$$$ ', 'Hi$$$ '],
    ['$ ', '$ '],
    ['a$ b ', 'a$ b'],
  ])('trims %j as typed to %j', (typed, kept) => {
    expect(solidScriptFieldTrim(typed)).toBe(kept);
  });

  it('writes the spaces at the ends of a text as $ and a space, and reads them back', () => {
    for (const text of [' a ', '   ', 'a  b', '  a b  ', '']) {
      expect(solidScriptFieldSpacesRead(solidScriptFieldSpacesWrite(text))).toBe(text);
      expect(solidScriptFieldTrim(solidScriptFieldSpacesWrite(text))).toBe(solidScriptFieldSpacesWrite(text));
    }
  });
});
