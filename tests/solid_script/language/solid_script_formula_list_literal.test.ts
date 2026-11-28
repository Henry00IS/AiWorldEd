import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptFieldCheck, solidScriptFieldPieces } from '@/solid_script/language/solid_script_field.js';
import { solidScriptFieldTokens } from '@/solid_script/language/solid_script_field_tokens.js';
import {
  solidScriptFormulaListInline,
  solidScriptFormulaListLiteral,
  solidScriptFormulaListWrite,
} from '@/solid_script/language/solid_script_formula_list_literal.js';
import { solidScriptFormulaProblem } from '@/solid_script/language/solid_script_formula_bare.js';

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
 * Reads the one bracketed part field text is made of.
 *
 * @param text Field text of one bracketed part.
 * @returns The part.
 */
function group(text: string): Extract<ReturnType<typeof solidScriptFieldPieces>[number], { kind: 'group' }> {
  const [only] = solidScriptFieldPieces(text);
  if (only?.kind !== 'group') throw new Error(`${text} is no bracketed part`);
  return only;
}

describe('SolidScript List()', () => {
  it('makes a list of any number of values, none included', () => {
    expect(outcome(echo('[=List(1, 2, 3)]'))).toEqual(['[1, 2, 3]']);
    expect(outcome(echo('[=List()] [=Len(List())]'))).toEqual(['[] 0']);
    expect(outcome(echo('[=List("a", "b")]'))).toEqual(['[a, b]']);
    expect(outcome(echo('[=List(0, List(1, 1, 1), "Easy")]'))).toEqual(['[0, [1, 1, 1], Easy]']);
    expect(outcome(echo('[=Reversed(List("a", "b", "c"))]'))).toEqual(['[c, b, a]']);
  });

  it('keeps each value whole: texts with commas and brackets, vectors and lists stay one item', () => {
    expect(outcome(echo('[=Len(List("a,b", "c$]d", "$[e$]"))] [=List("a,b")]'))).toEqual(['3 [a,b]']);
    expect(outcome(set('V', '1, 2, 3'), echo('[=List([V])] [=Len(List([V], [V]))]'))).toEqual(['[[1, 2, 3]] 2']);
    const many = Array.from({ length: 200 }, (_, index) => String(index)).join(', ');
    expect(outcome(echo(`[=Len(List(${many}))]`))).toEqual(['200']);
  });

  it('nests deeply', () => {
    let formula = '1';
    for (let depth = 0; depth < 30; depth++) formula = `List(${formula})`;
    let shown = '1';
    for (let depth = 0; depth < 30; depth++) shown = `[${shown}]`;
    expect(outcome(echo(`[=${formula}]`))).toEqual([shown]);
  });
});

describe('SolidScript lists in brackets inside a formula', () => {
  it('reads a bracket with a comma, one number, one text or nothing as a list', () => {
    expect(outcome(echo('[=Reversed(["a", "b", "c"])]'))).toEqual(['[c, b, a]']);
    expect(outcome(echo('[=[0, [1, 1, 1], "Easy"]] [=Len([0, [1, 1, 1], "Easy"])]'))).toEqual([
      '[0, [1, 1, 1], Easy] 3',
    ]);
    expect(outcome(echo('[=[0]] [=["0"]] [=[-2]] [=[]] [=Len([ ])]'))).toEqual(['[0] [0] [-2] [] 0']);
    expect(outcome(echo('[=IsString(First(["0"]))] [=IsNum(First([0]))]'))).toEqual(['Yes Yes']);
  });

  it('keeps commas and escaped brackets inside texts as part of the text', () => {
    expect(outcome(echo('[=Len(["a,b"])] [=Len(["x", "y,z"])]'))).toEqual(['1 2']);
    expect(outcome(echo('[=Join(["a$]b", "$[c"], "|")]'))).toEqual(['a]b|[c']);
  });

  it('mixes numbers, texts, variables, formulas and lists, at any depth', () => {
    expect(outcome(set('X', '7'), echo('[=[1, [X], "a", [=[X] * 2], 2 + 3]]'))).toEqual(['[1, 7, a, 14, 5]']);
    expect(outcome(set('V', '1, 2, 3'), echo('[=[[V], [V]]] [=[[[[1, 2]]]]]'))).toEqual([
      '[[1, 2, 3], [1, 2, 3]] [[[[1, 2]]]]',
    ]);
    let formula = '"deep"';
    for (let depth = 0; depth < 25; depth++) formula = `[${formula}, ${depth}]`;
    expect(outcome(echo(`[=Len(${formula})]`))).toEqual(['2']);
  });

  it('keeps [Name], [[Name]], member and system reads and three-number vectors as before', () => {
    expect(outcome(set('MyVar', '4'), echo('[=[MyVar] + 1]'))).toEqual(['5']);
    expect(outcome(set('Width', '5'), set('N', 'Width'), echo('[=[[N]] * 2]'))).toEqual(['10']);
    expect(outcome(set('Pos', '1, 2, 3'), echo('[=[Pos.Y] * 2] [=[$Box.Width] > 0]'))).toEqual(['4 Yes']);
    expect(outcome(echo('[=[1, 2, 3] + [1, 1, 1]]'))).toEqual(['[2, 3, 4]']);
    expect(outcome(set('X', '9'), echo('[=[1, 2, [X]]]'))).toEqual(['[1, 2, 9]']);
  });

  it('reads an item of a value with a number in brackets after it', () => {
    expect(outcome(set('L', '4, 5, 6'), echo('[=[L][1]] [=["a", "b"][0]]'))).toEqual(['5 a']);
  });

  it('still names a missing variable and still refuses text that is neither a name nor a list', () => {
    expect(outcome(echo('[=[Nope]]'))[0]).toMatch(/there is no variable \[Nope\]/);
    expect(outcome(echo('[=[1:3]]'))[0]).toMatch(/is not a vector/);
    expect(outcome(echo('[=Len([1, 2)]'))[0]).toMatch(/line 1/);
  });

  it('works in conditions, where the whole field is a formula', () => {
    const condition = (text: string) => outcome(line('if', { condition: text }), echo('in'), line('end'));
    expect(condition('Len([0, 1]) == 2')).toEqual(['in']);
    expect(condition('IndexOf(["a", "b"], "b") == 1')).toEqual(['in']);
  });
});

describe('SolidScript list brackets: what is a list and what stays a name', () => {
  it('tells lists from names by what no name can hold', () => {
    for (const text of ['[0]', '["0"]', '[]', '[ ]', '[1, 2]', '[-1]', '[[1, 2]]', '[[0]]', '[a, b]', '[Max(1, 2), 3]'])
      expect(solidScriptFormulaListLiteral(group(text)), text).toBe(true);
    for (const text of ['[Name]', '[[Name]]', '[Grid(1, 2)]', '[$Edge.Start]', '[=1, 2]', '[1:5]', '[a b]', '[Pos.X]'])
      expect(solidScriptFormulaListLiteral(group(text)), text).toBe(false);
  });

  it('leaves two or three plain numbers to be read as a vector, the way every field reads them', () => {
    expect(solidScriptFormulaListInline(group('[1, 2, 3]'))).toBe(false);
    expect(solidScriptFormulaListInline(group('[1, 2]'))).toBe(false);
    expect(solidScriptFormulaListInline(group('[1, 2, [X]]'))).toBe(true);
    expect(solidScriptFormulaListInline(group('[1, 2, 3, 4]'))).toBe(true);
  });

  it('writes a list as brackets, or List() for one item brackets would read as a name', () => {
    expect(solidScriptFormulaListWrite([])).toBe('[]');
    expect(solidScriptFormulaListWrite(['1'])).toBe('[1]');
    expect(solidScriptFormulaListWrite(['"a"'])).toBe('["a"]');
    expect(solidScriptFormulaListWrite(['-2'])).toBe('[-2]');
    expect(solidScriptFormulaListWrite(['[X]'])).toBe('List([X])');
    expect(solidScriptFormulaListWrite(['1 + 1'])).toBe('List(1 + 1)');
    expect(solidScriptFormulaListWrite(['1', '"b"', '[X]'])).toBe('[1, "b", [X]]');
  });

  it('checks lists in formulas and in field text before the run', () => {
    expect(solidScriptFieldCheck('[=Len([0, 1])]')).toBe('');
    expect(solidScriptFieldCheck('[=Len([0, [1.5], "a.b"])]')).toBe('');
    expect(solidScriptFieldCheck('Len([0, 1]) == 2', true)).toBe('');
    expect(solidScriptFieldCheck('[0, 1]')).toBe('');
    expect(solidScriptFieldCheck('[0, 1, 2, 3]')).toBe('');
    expect(solidScriptFieldCheck('[0, 1, 2,]')).toMatch(/is not a vector/);
    expect(solidScriptFieldCheck('[0,]')).toMatch(/is not a vector/);
    expect(solidScriptFormulaProblem('Reversed(["a", "b"])')).toBe('');
    expect(solidScriptFormulaProblem('[0, [1, 1, 1], "Easy"]')).toBe('');
  });

  it('colours a list in brackets inside a formula like the formula around it', () => {
    const text = '[=Reversed(["a", 1])]';
    const kinds = solidScriptFieldTokens(text).map((token) => [token.kind, text.slice(token.from, token.to)]);
    expect(kinds).toContainEqual(['string', '"a"']);
    expect(kinds).toContainEqual(['number', '1']);
    const name = '[=[Width]]';
    expect(solidScriptFieldTokens(name).map((token) => token.kind)).toContain('name');
  });
});

describe('SolidScript brackets inside quoted text of a formula', () => {
  it('reads a name in brackets inside quoted text into the text', () => {
    expect(outcome(set('Bla', '59'), echo('[="[Bla]"]'))).toEqual(['59']);
    expect(outcome(set('W', '15'), echo('[="Width [W] mm"]'))).toEqual(['Width 15 mm']);
    expect(outcome(set('W', '15'), echo('[=Uppercase("w [W] and [W]")]'))).toEqual(['W 15 AND 15']);
  });

  it('never leaks the name a bracketed part stands for while it is parsed', () => {
    expect(outcome(set('Bla', 'x'), echo('[=Str("[Bla]", "$[Bla$]")]'))).toEqual(['x[Bla]']);
    expect(outcome(set('Bla', 'x'), echo('[=Str("[Bla]", "[Bla]")]'))).toEqual(['xx']);
    expect(outcome(set('Bla', 'x'), echo('[="a [Missing] b"]')).join()).not.toContain('field_slot');
  });

  it('keeps a quote written with a $ and an escaped bracket as text', () => {
    expect(outcome(set('A', '1'), echo('[="say $"[A]$""]'))).toEqual(['say "1"']);
    expect(outcome(echo('[="$[x$]"]'))).toEqual(['[x]']);
  });

  it('reads a name made of another name, also next to a formula', () => {
    expect(outcome(set('a', 'a'), set('Bla', '59'), echo('[Bl[a]]'))).toEqual(['59']);
    expect(outcome(set('a', 'a'), set('Bla', '59'), echo('[=[Bl[a]] + 1]'))).toEqual(['60']);
  });
});
