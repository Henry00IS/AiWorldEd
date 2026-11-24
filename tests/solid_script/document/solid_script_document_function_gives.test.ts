import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptDocumentFlowEnd,
  solidScriptDocumentFunctionGives,
} from '@/solid_script/document/solid_script_document_flow.js';
import { solidScriptDocumentNames } from '@/solid_script/document/solid_script_document_names.js';
import { solidScriptExplorerEntries } from '@/solid_script/ui/solid_script_editor_explorer.js';
import {
  solidScriptSuggestionContext,
  solidScriptSuggestionHint,
  solidScriptSuggestions,
} from '@/solid_script/ui/solid_script_suggestions.js';
import { solidScriptDocumentNamesAt } from '@/solid_script/document/solid_script_document_names.js';

/**
 * Builds a Function line.
 *
 * @param name Function name.
 * @param parameters Inputs.
 * @returns Line.
 */
const fn = (name: string, parameters = ''): SolidScriptLine => ({ command: 'function', values: { name, parameters } });

/**
 * Builds a Return line.
 *
 * @param value Value.
 * @returns Line.
 */
const ret = (value: string): SolidScriptLine => ({ command: 'return', values: { value } });

/**
 * Builds an If line.
 *
 * @param condition Condition.
 * @returns Line.
 */
const when = (condition: string): SolidScriptLine => ({ command: 'if', values: { condition } });

/**
 * Builds a Set line.
 *
 * @param name Variable.
 * @param value Value.
 * @returns Line.
 */
const set = (name: string, value: string): SolidScriptLine => ({ command: 'variable', values: { name, value } });

const END: SolidScriptLine = { command: 'end' };

/** Henry's example: a point on a circle at a height. */
const SPOT: SolidScriptLine[] = [
  fn('Spot', 'Angle, Radius, Height'),
  ret('[=Vector([$Local.Radius] * Cos([$Local.Angle]), [$Local.Height], -[$Local.Radius] * Sin([$Local.Angle]))]'),
  END,
];

/**
 * Reads what a Function of a script gives.
 *
 * @param lines Script.
 * @param name Function.
 * @returns Kinds, sorted.
 */
function gives(lines: SolidScriptLine[], name: string): string[] | undefined {
  const kinds = solidScriptDocumentFunctionGives(solidScriptDocumentCreate(lines), name);
  return kinds === undefined ? undefined : [...kinds].sort();
}

/**
 * Reads what a Function gives in words, as the names list it.
 *
 * @param lines Script.
 * @param name Function.
 * @returns Words.
 */
function givesText(lines: SolidScriptLine[], name: string): string | undefined {
  return solidScriptDocumentNames(solidScriptDocumentCreate(lines)).find((entry) => entry.name === name)?.gives;
}

describe('Functions of the script give the kinds of their Returns', () => {
  it('gives a Vector for Henry’s Spot, called or not', () => {
    expect(gives(SPOT, 'Spot')).toEqual(['Vector']);
    expect(givesText(SPOT, 'Spot')).toBe('Vector');
    const called = [...SPOT, set('P', '[=Spot(1, 2, 3)]')];
    expect(gives(called, 'Spot')).toEqual(['Vector']);
    expect([...(solidScriptDocumentFlowEnd(solidScriptDocumentCreate(called)).get('p')?.kinds ?? [])]).toEqual([
      'Vector',
    ]);
  });

  it('joins several Returns of mixed kinds', () => {
    const lines = [fn('Pick', 'N'), when('[$Local.N] > 1'), ret('5'), END, when('[$Local.N] > 2'), ret('hello'), END];
    lines.push(ret('[=Vector(1, 2, 3)]'), END);
    expect(gives(lines, 'Pick')).toEqual(['Number', 'Text', 'Vector']);
    expect(givesText(lines, 'Pick')).toBe('Number or Text or Vector');
  });

  it('gives nothing without a Return that has a value', () => {
    expect(gives([fn('Build'), { command: 'cube' }, END], 'Build')).toEqual([]);
    expect(givesText([fn('Build'), { command: 'cube' }, END], 'Build')).toBe('Nothing');
    expect(givesText([fn('Stop'), ret(''), END], 'Stop')).toBe('Nothing');
    expect(gives(SPOT, 'Nobody')).toBeUndefined();
  });

  it('follows nested calls to other Functions, in any order', () => {
    const lines = [
      fn('Outer', 'A'),
      ret('[=Inner([$Local.A]).X]'),
      END,
      ...SPOT,
      fn('Inner', 'B'),
      ret('[=Spot(0, 1, [$Local.B])]'),
      END,
    ];
    expect(gives(lines, 'Inner')).toEqual(['Vector']);
    expect(gives(lines, 'Outer')).toEqual(['Number']);
  });

  it('uses the inputs given at the calls, and their kinds when nothing calls it', () => {
    const lines = [fn('Same', 'V'), ret('[$Local.V]'), END];
    expect(givesText(lines, 'Same')).toBe('Any');
    const called = [...lines, set('A', '[=Same(2)]'), set('B', '[=Same("x")]')];
    expect(gives(called, 'Same')).toEqual(['Number', 'Text']);
    expect(gives([fn('Twice', 'V'), ret('[=Sqrt([$Local.V])]'), END], 'Twice')).toEqual(['Number']);
  });

  it('settles recursion that ends, and gives Any for a cycle that never does', () => {
    const down = [fn('Down', 'N'), when('[$Local.N] <= 0'), ret('0'), END, ret('[=Down([$Local.N] - 1) + 1]'), END];
    expect(gives(down, 'Down')).toEqual(['Number']);
    expect(gives([...down, set('R', '[=Down(3)]')], 'Down')).toEqual(['Number']);
    const loop = [fn('Ping', 'N'), ret('[=Pong([$Local.N])]'), END, fn('Pong', 'N'), ret('[=Ping([$Local.N])]'), END];
    expect(givesText(loop, 'Ping')).toBe('Any');
    expect(givesText(loop, 'Pong')).toBe('Any');
    expect(givesText([fn('Self'), ret('[=Self()]'), END], 'Self')).toBe('Any');
    const mixed = [fn('Odd', 'N'), when('[$Local.N] == 0'), ret('nope'), END, ret('[=Even([$Local.N] - 1)]'), END];
    mixed.push(
      fn('Even', 'N'),
      when('[$Local.N] == 0'),
      ret('[=Vector(0, 0, 0)]'),
      END,
      ret('[=Odd([$Local.N] - 1)]'),
      END,
    );
    expect(gives(mixed, 'Odd')).toEqual(['Text', 'Vector']);
    expect(gives(mixed, 'Even')).toEqual(['Text', 'Vector']);
  });

  it('keeps the answer for the same version of the lines', () => {
    const script = solidScriptDocumentCreate(SPOT);
    expect(solidScriptDocumentFunctionGives(script, 'Spot')).toBe(solidScriptDocumentFunctionGives(script, 'Spot'));
  });
});

describe('What a Function gives reaches the editor', () => {
  it('shows in the call hint, the suggestions and the variable explorer', () => {
    const script = solidScriptDocumentCreate([...SPOT, set('P', '')]);
    const names = solidScriptDocumentNamesAt(script, 3);
    const scope = { names, extra: [], words: [] };
    expect(solidScriptSuggestionHint(solidScriptSuggestionContext('[=Spot(1, ', 10, false), scope)?.gives).toBe(
      'Vector',
    );
    const offered = solidScriptSuggestions(solidScriptSuggestionContext('[=Sp', 4, false), scope).find(
      (entry) => entry.label === 'Spot',
    );
    expect(offered?.detail).toBe('Spot(Angle, Radius, Height) -> Vector');
    const entry = solidScriptExplorerEntries(script, [], []).find((known) => known.name === 'Spot');
    expect(entry?.type).toBe('Function -> Vector');
  });
});
