import { describe, expect, it } from 'vitest';
import {
  solidScriptFieldBracketsAround,
  solidScriptFieldTokenKey,
  solidScriptFieldTokens,
} from '@/solid_script/language/solid_script_field_tokens.js';

/**
 * Lists the pieces of field text as kind:text, leaving out blanks.
 *
 * @param text Field text.
 * @returns Pieces.
 */
function pieces(text: string): string[] {
  return solidScriptFieldTokens(text)
    .map((token) => `${token.kind}:${text.slice(token.from, token.to)}`)
    .filter((piece) => piece.trim() !== 'text:');
}

describe('solidScriptFieldTokens', () => {
  it('splits a formula into brackets, calls, names, numbers, texts and operators, with commas as plain text', () => {
    expect(pieces('[=Spot([Middle], [RailAt], 2 * "a")]')).toEqual([
      'bracket:[=',
      'function:Spot',
      'bracket:(',
      'bracket:[',
      'name:Middle',
      'bracket:]',
      'text:, ',
      'bracket:[',
      'name:RailAt',
      'bracket:]',
      'text:, ',
      'number:2',
      'operator:*',
      'string:"a"',
      'bracket:)',
      'bracket:]',
    ]);
  });

  it('tells Local, Persistent and built-in names apart and keeps escapes plain', () => {
    expect(pieces('[$Local.Width] [$Persistent.Presses] [Face.Center.x] $[x$] 12')).toEqual([
      'bracket:[',
      'local:$Local.Width',
      'bracket:]',
      'bracket:[',
      'persistent:$Persistent.Presses',
      'bracket:]',
      'bracket:[',
      'name:Face.Center.x',
      'bracket:]',
      'text: $[x$] ',
      'number:12',
    ]);
    expect(pieces('[=true and $Local.A]')).toEqual([
      'bracket:[=',
      'keyword:true',
      'keyword:and',
      'local:$Local.A',
      'bracket:]',
    ]);
  });

  it('pairs brackets and finds every pair around the caret', () => {
    const text = '[=Spot([Middle], 1)]';
    const tokens = solidScriptFieldTokens(text);
    const around = (caret: number): string[] =>
      solidScriptFieldBracketsAround(tokens, caret)
        .map((index) => tokens[index]!)
        .map((token) => `${text.slice(token.from, token.to)}@${token.from}`)
        .sort();
    expect(around(text.indexOf('Middle') + 2)).toEqual(['(@6', ')@18', '[=@0', '[@7', ']@14', ']@19']);
    expect(around(text.indexOf('1'))).toEqual(['(@6', ')@18', '[=@0', ']@19']);
    expect(around(0)).toEqual([]);
    expect(solidScriptFieldBracketsAround(solidScriptFieldTokens('[=Max(1, '), 9)).toHaveLength(2);
  });

  it('checks whole names and calls, not names built from names', () => {
    const keys = (text: string): string[] =>
      solidScriptFieldTokens(text)
        .map((token) => solidScriptFieldTokenKey(text, token))
        .filter((key): key is string => key !== null);
    expect(keys('[Width] [Pos.x] [points(0)] [part[i]] [=Max($Local.A, b)]')).toEqual([
      'width',
      'pos',
      'points',
      'i',
      'max()',
      '$local.a',
    ]);
  });
  it('colours every number of a list, of points and of a formula', () => {
    const numbers = (text: string) =>
      solidScriptFieldTokens(text)
        .filter((token) => token.kind === 'number')
        .map((token) => text.slice(token.from, token.to));
    expect(numbers('0.1, 1, 0.1')).toEqual(['0.1', '1', '0.1']);
    expect(numbers('0,0;1,0; 0, 1')).toEqual(['0', '0', '1', '0', '0', '1']);
    expect(numbers('[Width], 2, -3')).toEqual(['2', '-3']);
    expect(numbers('[=Max(1, 2) + 3.5]')).toEqual(['1', '2', '3.5']);
  });

  it('marks the operators of a formula, but not the commas between values', () => {
    const text = '[=Max([A] + 2, 3) * 4 / 5 - 6 ^ 2 % 3 >= 1]';
    const operators = solidScriptFieldTokens(text)
      .filter((token) => token.kind === 'operator')
      .map((token) => text.slice(token.from, token.to));
    expect(operators).toEqual(['+', '*', '/', '-', '^', '%', '>', '=']);
  });

  it('reads a whole formula without brackets around it when it starts as a formula', () => {
    const kinds = (text: string, start: 'text' | 'formula') =>
      solidScriptFieldTokens(text, start)
        .filter((token) => text.slice(token.from, token.to).trim() !== '')
        .map((token) => token.kind);
    expect(kinds('Abs(0.5) > "Top"', 'formula')).toEqual([
      'function',
      'bracket',
      'number',
      'bracket',
      'operator',
      'string',
    ]);
    expect(kinds('Abs(0.5) > "Top"', 'text')).not.toContain('function');
  });
});
