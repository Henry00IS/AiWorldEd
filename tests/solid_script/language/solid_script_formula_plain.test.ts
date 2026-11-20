import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import type { SolidScriptFieldKind } from '@/solid_script/language/solid_script_field.js';
import {
  solidScriptFormulaFromPlain,
  solidScriptFormulaToPlain,
} from '@/solid_script/language/solid_script_formula_plain.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/** Plain field text of each kind, with the formula it opens as. */
const PLAIN: readonly [SolidScriptFieldKind, string, string][] = [
  ['vector3', '2, 2, 2', '[2, 2, 2]'],
  ['vector3', '0, [Base], 0', 'Vector(0, [Base], 0)'],
  ['vector3', '0, [=[Base] * 2], 0', 'Vector(0, [Base] * 2, 0)'],
  ['vector2', '1, 2', 'Vector(1, 2)'],
  ['value', '1, 2, 3', '[1, 2, 3]'],
  ['value', '-1.5, -0.5, 0.5, 1.5', '[-1.5, -0.5, 0.5, 1.5]'],
  ['value', 'Red, Green', '["Red", "Green"]'],
  ['value', '[P], [P]', '[[P], [P]]'],
  ['points3', '[0, 0, 0], [1, 0, 0], [1, 1, 0]', '[[0, 0, 0], [1, 0, 0], [1, 1, 0]]'],
  ['points3', '[=Vector(1, 2, 3)], [=Vector(4, 5, 6)]', '[Vector(1, 2, 3), Vector(4, 5, 6)]'],
  ['text', 'Fully Inside', '"Fully Inside"'],
  ['message', 'Hi [Name]', 'Str("Hi ", [Name])'],
  ['message', 'Hi$, there [Name]!', 'Str("Hi, there ", [Name], "!")'],
  ['message', '$[Box$] is', '"$[Box$] is"'],
  ['value', 'Top and Side, 5', '["Top and Side", 5]'],
];

/**
 * Runs a field through Echo, once as typed and once as the formula it opens as,
 * and tells whether both give the same value.
 *
 * @param plain Field text.
 * @param formula Formula.
 * @returns Message of the comparison.
 */
function same(plain: string, formula: string): string {
  const set = (name: string, value: string) => ({ command: 'variable', values: { name, value } });
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([
      set('Base', '7'),
      set('Name', 'Bob'),
      set('P', '1, 2, 3'),
      set('Plain', plain),
      set('Formula', `[=${formula}]`),
      { command: 'echo', values: { value: '[=[Plain] == [Formula]]' } },
      { command: 'cube' },
    ]),
  );
  return result.error ? result.error.message : result.messages.join('|');
}

describe('SolidScript formula plain values', () => {
  it('opens plain field text of every kind as a formula of the same value', () => {
    for (const [kind, plain, formula] of PLAIN) {
      expect(solidScriptFormulaFromPlain(kind, plain), plain).toBe(formula);
      expect(same(plain, formula), plain).toBe('Yes');
    }
  });

  it('writes those formulas back as the plain text they came from, or a neater one of the same value', () => {
    for (const [kind, plain, formula] of PLAIN) {
      const neater: Record<string, string> = {
        'Hi$, there [Name]!': 'Hi, there [Name]!',
        '[=Vector(1, 2, 3)], [=Vector(4, 5, 6)]': '[1, 2, 3], [4, 5, 6]',
      };
      const back = neater[plain] ?? plain;
      expect(solidScriptFormulaToPlain(kind, formula), formula).toBe(back);
    }
  });

  it('opens a double quote as $", and nothing for a broken bracket or an empty item', () => {
    expect(solidScriptFormulaFromPlain('text', 'say "hi"')).toBe('"say $"hi$""');
    expect(solidScriptFormulaFromPlain('message', 'Hi [Name')).toBeNull();
    expect(solidScriptFormulaFromPlain('value', '1, , 2')).toBeNull();
  });

  it('keeps formulas that are more than a plain value as formulas', () => {
    expect(solidScriptFormulaToPlain('text', '4 > 2 ? "Subtractive" : "Additive"')).toBeNull();
    expect(solidScriptFormulaToPlain('text', '"5"')).toBeNull();
    expect(solidScriptFormulaToPlain('text', '"a [b]"')).toBeNull();
    expect(solidScriptFormulaToPlain('value', '$[5$]')).toBeNull();
    expect(solidScriptFormulaToPlain('value', '$[1, 2, 3$]')).toBeNull();
    expect(solidScriptFormulaToPlain('vector3', 'Vector(1, [h] + 1, 3)')).toBe('1, [=[h] + 1], 3');
    expect(solidScriptFormulaToPlain('text', 'Max(1, 2)')).toBeNull();
  });
});
