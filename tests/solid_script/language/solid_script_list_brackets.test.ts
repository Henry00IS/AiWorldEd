import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptFieldCheck, solidScriptFieldPieces } from '@/solid_script/language/solid_script_field.js';
import { solidScriptFieldTokens } from '@/solid_script/language/solid_script_field_tokens.js';
import { solidScriptFormulaListOuter } from '@/solid_script/language/solid_script_formula_list_literal.js';

const line = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values });
const END = line('end');
const set = (name: string, value: string): SolidScriptLine => line('variable', { name, value });
const echo = (value: string): SolidScriptLine => line('echo', { value });

/**
 * Runs script lines.
 *
 * @param lines Lines.
 * @returns Messages, and the error or null.
 */
function run(...lines: SolidScriptLine[]): { messages: string[]; error: string | null } {
  const result = solidScriptProgramRun(solidScriptDocumentCreate(lines), {});
  return { messages: result.messages, error: result.error?.message ?? null };
}

/**
 * What Echo prints for a variable set to field text, with its count.
 *
 * @param text Field text of the Set line.
 * @returns Printed text.
 */
function stored(text: string): string[] {
  const result = run(set('X', text), echo('[X.Count] [X]'));
  expect(result.error).toBeNull();
  return result.messages;
}

/**
 * Tells whether the bracketed part of field text standing alone is a list.
 *
 * @param text Field text that is one bracketed part.
 * @returns True for a list.
 */
function outer(text: string): boolean {
  const [group] = solidScriptFieldPieces(text);
  return group?.kind === 'group' && solidScriptFormulaListOuter(group);
}

describe('SolidScript lists written in brackets in any field', () => {
  it('reads [] and [ ] as an empty list', () => {
    expect(stored('[]')).toEqual(['0 []']);
    expect(stored('[ ]')).toEqual(['0 []']);
    expect(stored('[=[]]')).toEqual(['0 []']);
  });

  it('reads lists inside lists, as deep as written', () => {
    expect(stored('[[1, 2], [3, 4]]')).toEqual(['2 [[1, 2], [3, 4]]']);
    expect(stored('[[1, 2], "x", []]')).toEqual(['3 [[1, 2], x, []]']);
    expect(stored('[[[1]], [[2, 3, 4, 5]]]')).toEqual(['2 [[[1]], [[2, 3, 4, 5]]]']);
    const read = run(set('X', '[[1, 2], [3, 4]]'), echo('[=[X][1][0]]'));
    expect(read.messages).toEqual(['3']);
  });

  it('reads one number or text, four or more items, and texts as a list', () => {
    expect(stored('[5]')).toEqual(['1 [5]']);
    expect(stored('[-1]')).toEqual(['1 [-1]']);
    expect(stored('["a"]')).toEqual(['1 [a]']);
    expect(stored('["a", "b"]')).toEqual(['2 [a, b]']);
    expect(stored('[1, 2, 3, 4]')).toEqual(['4 [1, 2, 3, 4]']);
  });

  it('keeps two or three numbers a vector, and the same as without brackets', () => {
    expect(stored('[1, 2]')).toEqual(stored('1, 2'));
    expect(stored('[1, 2, 3]')).toEqual(['3 [1, 2, 3]']);
    expect(stored('[1.5, -2.5]')).toEqual(['2 [1.5, -2.5]']);
    expect(run(line('cube', { size: '[1, 2, 3]' }), echo('ok')).error).toBeNull();
  });

  it('keeps [Name] a variable, [[Name]] a variable named by another, and reads variables inside a list', () => {
    const result = run(set('A', '4'), set('Name', 'A'), set('B', '7'), echo('[A] [[Name]] [[A], [B]] [1, [A]]'));
    expect(result.messages).toEqual(['4 4 [4, 7] [1, 4]']);
    expect(run(echo('[Missing]')).error).toMatch(/no variable \[Missing\]/);
  });

  it('keeps $[ and $] as brackets, never as a list', () => {
    expect(run(echo('$[$] | $[1, 2, 3, 4$] | a $[x$] b')).messages).toEqual(['[] | [1, 2, 3, 4] | a [x] b']);
  });

  it('puts a list written in brackets into text as its items', () => {
    expect(run(echo('Items [1, 2, 3, 4] and [] and ["a"]')).messages).toEqual(['Items [1, 2, 3, 4] and [] and [a]']);
  });

  it('loops For Each over a written list, and not at all over []', () => {
    const empty = run(line('for_each', { list: '[]' }), echo('round'), END, echo('done'));
    expect(empty.messages).toEqual(['done']);
    const nested = run(line('for_each', { list: '[[1, 2], [3, 4]]' }), echo('[Item.Count]: [Item]'), END);
    expect(nested.messages).toEqual(['2: [1, 2]', '2: [3, 4]']);
    const fromVariable = run(set('L', '[]'), line('for_each', { list: '[L]' }), echo('round'), END, echo('done'));
    expect(fromVariable.messages).toEqual(['done']);
  });

  it('still explains a vector with a number left out', () => {
    expect(run(set('V', '[1,]')).error).toMatch(/Did you mean to write \[1, 0\]\?/);
    expect(run(set('V', '[1,,2]')).error).toMatch(/is not a vector/);
    expect(solidScriptFieldCheck('[3,]')).toMatch(/Did you mean to write \[3, 0\]\?/);
  });

  it('names a word without brackets inside a list', () => {
    expect(run(set('A', '1'), set('X', '[A, 2, 3, 4]')).error).toMatch(/A needs brackets in a formula.*write \[A\]/);
  });

  it('stops a number field on a list with the type', () => {
    expect(run(line('repeat', { to: '[]' }), echo('r'), END).error).toMatch(/To needs a Number or Text, not a List/);
  });

  it('checks lists before the run without a problem', () => {
    for (const text of ['[]', '[ ]', '["a", "b"]', '[[1, 2], [3, 4]]', '[1, 2, 3, 4]', '[5]', '[[X], 2]'])
      expect(solidScriptFieldCheck(text), text).toBe('');
  });

  it('tells which brackets are lists', () => {
    expect(outer('[]')).toBe(true);
    expect(outer('[[1, 2], [3, 4]]')).toBe(true);
    expect(outer('[1, 2, 3, 4]')).toBe(true);
    expect(outer('["a"]')).toBe(true);
    expect(outer('[1, 2]')).toBe(false);
    expect(outer('[1, 2, 3]')).toBe(false);
    expect(outer('[Name]')).toBe(false);
    expect(outer('[[Name]]')).toBe(false);
    expect(outer('[=1 + 2]')).toBe(false);
    expect(outer('[1,]')).toBe(false);
    expect(outer('[,1]')).toBe(false);
  });

  it('colours a list written in brackets like a formula', () => {
    const text = '["a", 1, 2, 3]';
    const kinds = solidScriptFieldTokens(text).map((token) => [token.kind, text.slice(token.from, token.to)]);
    expect(kinds).toContainEqual(['string', '"a"']);
    expect(kinds).toContainEqual(['number', '3']);
  });
});
