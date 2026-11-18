import { describe, expect, it } from 'vitest';
import {
  solidScriptFieldCheck,
  solidScriptFieldIsVariable,
  solidScriptFieldResolve,
  solidScriptFieldSplit,
  type SolidScriptFieldContext,
} from '@/solid_script/language/solid_script_field.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import type { SolidScriptValue } from '@/solid_script/language/solid_script_value.js';

/** Variables of the tests, as a script would have set them. */
const VARIABLES: Record<string, SolidScriptValue> = {
  width: 3,
  depth: 2,
  name: 'Gate',
  offset: [1, 2, 3],
  var1: 4,
  var4: 'four',
  part1: 'first',
  i: 1,
};

/** Field context over the test variables, with formulas of + and * only. */
const CONTEXT: SolidScriptFieldContext = {
  variable: (name) => {
    if (!(name in VARIABLES)) throw new Error(`there is no variable [${name}]`);
    return VARIABLES[name];
  },
  variablePlain: (name) => CONTEXT.variable(name),
  variableLocal: (_bare, name) => CONTEXT.variable(name),
  variableComponent: (_base, _index, name) => CONTEXT.variable(name),
  variableItem: (list, index) => CONTEXT.variable(`${list}(${String(index)})`),
  formula: (text) => {
    if (!/^[\d\s+*().[\],-]+$/.test(text)) throw new Error(`cannot read ${text}`);
    return Function(`return (${text});`)() as SolidScriptValue;
  },
  formulaParse: () => null,
  formulaRun: () => {
    throw new Error('this context reads formulas as text');
  },
};

/**
 * Runs lines in a fresh machine.
 *
 * @param lines Lines.
 * @returns Run.
 */
function run(...lines: SolidScriptLine[]) {
  return solidScriptProgramRun(solidScriptDocumentCreate(lines));
}

describe('SolidScript field text', () => {
  it('reads plain numbers and comma lists without quotes or brackets', () => {
    expect(solidScriptFieldResolve('number', '2.5', CONTEXT)).toBe(2.5);
    expect(solidScriptFieldResolve('vector3', '1, 2, 3', CONTEXT)).toEqual([1, 2, 3]);
    expect(solidScriptFieldResolve('vector3', '2', CONTEXT)).toBe(2);
    expect(solidScriptFieldResolve('points2', '0, 0; 2, 0; 1, 2', CONTEXT)).toEqual([
      [0, 0],
      [2, 0],
      [1, 2],
    ]);
    expect(solidScriptFieldResolve('boolean', 'Yes', CONTEXT)).toBe(true);
    expect(solidScriptFieldResolve('boolean', 'false', CONTEXT)).toBe(false);
  });

  it('puts in variables with [name], keeping the value of a lone variable', () => {
    expect(solidScriptFieldResolve('number', '[width]', CONTEXT)).toBe(3);
    expect(solidScriptFieldResolve('vector3', '[offset]', CONTEXT)).toEqual([1, 2, 3]);
    expect(solidScriptFieldResolve('vector3', '[width], 1, [depth]', CONTEXT)).toEqual([3, 1, 2]);
  });

  it('computes [=formula], with variables inside written as [name]', () => {
    expect(solidScriptFieldResolve('number', '[=[width] * 2]', CONTEXT)).toBe(6);
    expect(solidScriptFieldResolve('vector3', '[=[i] * 2], 0, [=[width] + [depth]]', CONTEXT)).toEqual([2, 0, 5]);
    expect(solidScriptFieldResolve('condition', '[width] + 1', CONTEXT)).toBe(4);
  });

  it('nests brackets, so names and formulas can be built from variables', () => {
    expect(solidScriptFieldResolve('message', '[part[i]]', CONTEXT)).toBe('first');
    expect(solidScriptFieldResolve('message', '[var[=[i] * 4]]', CONTEXT)).toBe('four');
    expect(solidScriptFieldResolve('number', '[=[var1] + [=[i] + 1]]', CONTEXT)).toBe(6);
  });

  it('writes messages as plain text without quotes, with variables and formulas put in', () => {
    expect(solidScriptFieldResolve('message', 'Hello', CONTEXT)).toBe('Hello');
    expect(solidScriptFieldResolve('message', 'Width is [width], area [=[width] * [depth]]', CONTEXT)).toBe(
      'Width is 3, area 6',
    );
    expect(solidScriptFieldResolve('message', '"[name]"', CONTEXT)).toBe('"Gate"');
  });

  it('keeps characters after $ as typed: $[ and $] for brackets, $$ for a dollar sign', () => {
    expect(solidScriptFieldResolve('message', 'Use $[width$] for [width] and pay $$5', CONTEXT)).toBe(
      'Use [width] for 3 and pay $5',
    );
    expect(solidScriptFieldResolve('number', '[=$[1, 2$]$[1$] * 2]', CONTEXT)).toBe(4);
  });

  it('reads the value of Set as a number, a list of numbers, a switch or else text', () => {
    expect(solidScriptFieldResolve('value', '3', CONTEXT)).toBe(3);
    expect(solidScriptFieldResolve('value', '1, [width], 3', CONTEXT)).toEqual([1, 3, 3]);
    expect(solidScriptFieldResolve('value', 'true', CONTEXT)).toBe(true);
    expect(solidScriptFieldResolve('value', 'North Gate', CONTEXT)).toBe('North Gate');
  });

  it('uses name and note text exactly as typed', () => {
    expect(solidScriptFieldResolve('name', 'width', CONTEXT)).toBe('width');
    expect(solidScriptFieldResolve('text', 'A [note] $ here', CONTEXT)).toBe('A [note] $ here');
  });

  it('explains unbalanced brackets, empty brackets and a lone $ that is just a dollar', () => {
    expect(solidScriptFieldCheck('[width')).toMatch(/\[ has no \]/);
    expect(solidScriptFieldCheck('width]')).toMatch(/\] has no \[/);
    expect(solidScriptFieldCheck('cost $')).toBe('');
    expect(() => solidScriptFieldResolve('number', '[]', CONTEXT)).toThrow(/empty/);
    expect(() => solidScriptFieldResolve('number', '[=]', CONTEXT)).toThrow(/no formula/);
    expect(solidScriptFieldCheck('[=[i] * 2], 0, 0')).toBe('');
  });

  it('splits at separators outside brackets only', () => {
    expect(solidScriptFieldSplit('[=max([a], [b])], 2', ',')).toEqual(['[=max([a], [b])]', '2']);
    expect(solidScriptFieldSplit('a $[, b, c', ',')).toEqual(['a $[', 'b', 'c']);
  });

  it('recognises a lone variable for the listing', () => {
    expect(solidScriptFieldIsVariable('[width]')).toBe(true);
    expect(solidScriptFieldIsVariable('[=width]')).toBe(false);
    expect(solidScriptFieldIsVariable('[width], 1')).toBe(false);
  });
});

describe('SolidScript fields in a running script', () => {
  it('runs plain fields end to end: Set, Repeat with [=formula], Echo without quotes', () => {
    const result = run(
      { command: 'variable', values: { name: 'width', value: '2' } },
      { command: 'repeat', values: { variable: 'i', from: '0', to: '2' } },
      { command: 'translate', values: { v: '[=[i] * [width]], 0, 0' } },
      { command: 'cube', values: { size: '[width], 1, 1' } },
      { command: 'end' },
      { command: 'end' },
      { command: 'echo', values: { value: 'Width is [width], double [=[width] * 2]' } },
    );
    expect(result.error).toBeNull();
    expect(result.steps).toHaveLength(3);
    expect(result.messages).toEqual(['Width is 2, double 4']);
  });

  it('stops at the line of an unknown variable, naming the field and the variable', () => {
    const result = run({ command: 'cube' }, { command: 'sphere', values: { r: '[radius]' } });
    expect(result.error?.line).toBe(2);
    expect(result.error?.message).toMatch(/Radius: there is no variable \[radius\]/);
  });

  it('stops at the line of a formula that cannot be read, quoting it', () => {
    const result = run({ command: 'cube', values: { size: '[=1 +], 1, 1' } });
    expect(result.error?.line).toBe(1);
    expect(result.error?.message).toMatch(/Size: the formula "1 \+" cannot be read/);
  });

  it('reads If conditions as formulas with [name] variables', () => {
    const result = run(
      { command: 'variable', values: { name: 'open', value: '3' } },
      { command: 'if', values: { condition: '[open] > 2' } },
      { command: 'echo', values: { value: 'wide' } },
      { command: 'else' },
      { command: 'echo', values: { value: 'narrow' } },
      { command: 'end' },
      { command: 'cube' },
    );
    expect(result.error).toBeNull();
    expect(result.messages).toEqual(['wide']);
  });
});
