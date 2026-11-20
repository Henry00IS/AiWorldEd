import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptFormulaBareReads,
  solidScriptFormulaProblem,
} from '@/solid_script/language/solid_script_formula_bare.js';
import { SolidScriptFormulaSource } from '@/solid_script/language/solid_script_formula_source.js';
import {
  solidScriptFieldMistake,
  solidScriptFieldMistakeOf,
  solidScriptMistakeNamesWritten,
} from '@/solid_script/language/solid_script_field_mistakes.js';

const line = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values });
const set = (name: string, value: string): SolidScriptLine => line('variable', { name, value });
const echo = (value: string): SolidScriptLine => line('echo', { value });
const CUBE = line('cube', { size: '2, 2, 2' });

/**
 * Runs lines and a cube after them.
 *
 * @param lines Lines to run first.
 * @returns What the run printed, or the error it stopped with.
 */
function outcome(...lines: SolidScriptLine[]): string[] {
  const result = solidScriptProgramRun(solidScriptDocumentCreate([...lines, CUBE]), {});
  return result.error ? [result.error.message] : result.messages;
}

/**
 * Lists the names a formula writes without brackets.
 *
 * @param formula Formula without its [= and ].
 * @returns Names with their members.
 */
function bare(formula: string): string[] {
  const source = SolidScriptFormulaSource.read(formula);
  return solidScriptFormulaBareReads(source.tree, (node) => source.slot(node)).map((read) => read.name);
}

describe('SolidScript formulas read every name in brackets', () => {
  it('reads [Name] and [=[Name]], and only functions without brackets', () => {
    expect(outcome(set('Bla', '3'), echo('[Bla] [=[Bla]] [=[Bla] * 2] [=Sin(90)]'))).toEqual(['3 3 6 1']);
  });

  it('stops [=Bla] with the formula that works when Bla is a variable', () => {
    const [message] = outcome(set('Bla', '3'), echo('[=Bla]'));
    expect(message).toMatch(
      /Bla needs brackets in a formula; a word without them can only be a function, such as Sin\(5\)/,
    );
    expect(message).toContain('Did you mean to write [=[Bla]]?');
    expect(message!.split('Did you mean').length).toBe(2);
    expect(outcome(set('Bla', '3'), echo('[=Bla * 2 + Max(Bla, 1)]'))[0]).toContain(
      'Did you mean to write [=[Bla] * 2 + Max([Bla], 1)]?',
    );
  });

  it('brackets a whole member read and a system value, with its $', () => {
    expect(outcome(set('P', '1, 2, 3'), echo('[=P.X * 2]'))[0]).toContain('Did you mean to write [=[P.X] * 2]?');
    expect(outcome(echo('[=$Box.Width + 1]'))[0]).toContain('Did you mean to write [=[$Box.Width] + 1]?');
    expect(outcome(echo('[=Box.Width + 1]'))[0]).toContain('Did you mean to write [=[$Box.Width] + 1]?');
    expect(outcome(echo('[=Pi]'))[0]).toContain('Did you mean to write [=[$Math.Pi]]?');
  });

  it('tells a word that is no variable apart, with how to write a variable and a text', () => {
    expect(outcome(echo('[=Uppercase(Hello)]'))[0]).toMatch(
      /Hello needs brackets in a formula.*There is no variable Hello either; for a variable write \[Hello\], for text write "Hello"/,
    );
  });

  it('refuses a function name in brackets, as a name, the way it always did', () => {
    expect(outcome(echo('[Sin(5)]'))[0]).toMatch(/no variable|no list/);
    expect(outcome(echo('[=[Sin(5)]]'))[0]).toMatch(/no variable|no list/);
  });

  it('lets a variable share a name with a function, since a word without brackets is always the function', () => {
    expect(outcome(set('Sin', '5'), set('Max', '2'), echo('[=Sin(90) + [Sin]] [=Max([Max], 7)]'))).toEqual(['6 7']);
    expect(outcome(set('List', '1'), echo('[=List([List], 2)]'))).toEqual(['[1, 2]']);
  });

  it('stops a condition that writes a name without brackets, and runs it with them', () => {
    const condition = (text: string) =>
      outcome(set('Width', '3'), line('if', { condition: text }), echo('in'), line('end'));
    expect(condition('[Width] > 1')).toEqual(['in']);
    expect(condition('Width > 1')[0]).toContain('Did you mean to write [Width] > 1?');
  });

  it('finds every name without brackets, but no function, bracketed part or name a list comprehension binds', () => {
    expect(bare('Width + [Height] * Sin(Depth) - Edge.Start.X')).toEqual(['Width', 'Depth', 'Edge.Start.X']);
    expect(bare('$[for (i = $[0:2$]) i * Step$]')).toEqual(['Step']);
    expect(bare('Max([A], [B]) + [C].X')).toEqual([]);
    expect(outcome(echo('[=$[for (i = $[0:2$]) i * 2$]]'))).toEqual(['[0, 2, 4]']);
  });

  it('writes the brackets a formula needs for the names it surely means, with the one hint every name mistake uses', () => {
    const sees = (name: string) => ['width', 'edge'].includes(name.toLowerCase());
    expect(solidScriptMistakeNamesWritten('[=Width * 2 + Edge.Length]', sees, true)).toBe(
      '[=[Width] * 2 + [Edge.Length]]',
    );
    expect(solidScriptFieldMistake('[=Nope + Box.Height]', true, () => false, sees)).toBe('[=Nope + [$Box.Height]]');
    expect(solidScriptFieldMistake('[=$X + 1]', true, () => false, sees)).toBe('[=[$X] + 1]');
    expect(solidScriptFieldMistake('[=[Width] + Sin(5)]', true, () => false, sees)).toBe('');
    expect(solidScriptFieldMistake('[=broken +]', true, () => false, sees)).toBe('');
    expect(solidScriptFieldMistake('[=$[for (i = $[0:2$]) i * Width$]]', true, () => false, sees)).toBe(
      '[=$[for (i = $[0:2$]) i * [Width]$]]',
    );
  });

  it('shows the problem in the formula window before running, and the hint in the editor', () => {
    expect(solidScriptFormulaProblem('Width + 1')).toMatch(/^Width needs brackets in a formula.*; write \[Width\]$/);
    expect(solidScriptFormulaProblem('[Width] + 1')).toBe('');
    const sees = (name: string) => name.toLowerCase() === 'width';
    const why = 'a formula reads every variable and system value in brackets';
    expect(solidScriptFieldMistakeOf({ type: 'number' }, '[=Width * 2]', () => false, sees)).toBe(
      `${why}. Did you mean to write [=[Width] * 2]?`,
    );
    expect(solidScriptFieldMistakeOf({ type: 'condition' }, 'Width > 1', () => false, sees)).toBe(
      `${why}. Did you mean to write [Width] > 1?`,
    );
    expect(solidScriptFieldMistakeOf({ type: 'number' }, '[=[Width] * 2]', () => false, sees)).toBe('');
  });
});
