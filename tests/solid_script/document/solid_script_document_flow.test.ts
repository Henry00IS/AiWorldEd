import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentFlowAt } from '@/solid_script/document/solid_script_document_flow.js';

/**
 * Builds a line.
 *
 * @param command Command id.
 * @param values Field texts.
 * @returns Line.
 */
const line = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values });

/**
 * Builds a Set line.
 *
 * @param name Variable.
 * @param value Value.
 * @returns Line.
 */
const set = (name: string, value: string): SolidScriptLine => line('variable', { name, value });

/**
 * Lists the kinds a variable may hold where a line stands, sorted.
 *
 * @param lines Script.
 * @param position 0-based line, or where a new line goes.
 * @param name Variable name key.
 * @returns Kinds, empty for one only running tells.
 */
function kindsAt(lines: SolidScriptLine[], position: number, name: string): string[] {
  const variable = solidScriptDocumentFlowAt(solidScriptDocumentCreate(lines), position).get(name);
  return [...(variable?.kinds ?? [])].sort();
}

/** Henry's script: Henry is a Text, then a Number, then a Brush. */
const HENRY: SolidScriptLine[] = [set('Henry', 'Henry'), set('Henry', '4'), line('cube', { into: 'Henry' })];

describe('SolidScript kinds followed through the script', () => {
  it('replaces the kinds on every write, line by line', () => {
    expect(kindsAt(HENRY, 1, 'henry')).toEqual(['Text']);
    expect(kindsAt(HENRY, 2, 'henry')).toEqual(['Number']);
    expect(kindsAt(HENRY, 3, 'henry')).toEqual(['Brush']);
    expect(kindsAt(HENRY, 0, 'henry')).toEqual([]);
  });

  it('reads the kind of a typed list, a vector, a number and a face line', () => {
    const lines = [
      set('Mixed', '[5,3,4],zu,45,[4,5,6]'),
      set('Pos', '1, 2, 3'),
      set('Size', 'oak'),
      set('Size', '12.5'),
      line('select_faces', { into: 'Tops' }),
    ];
    expect(kindsAt(lines, 5, 'mixed')).toEqual(['List']);
    expect(kindsAt(lines, 5, 'pos')).toEqual(['Vector']);
    expect(kindsAt(lines, 5, 'size')).toEqual(['Number']);
    expect(kindsAt(lines, 5, 'tops')).toEqual(['Face List']);
  });

  it('joins both sides of an If at its End', () => {
    const lines = [
      set('A', '1'),
      line('if', { condition: '[Coin] == 1' }),
      set('A', 'oak'),
      line('else'),
      line('cube', { into: 'A' }),
      line('end'),
      line('if', { condition: '[Coin] == 1' }),
      set('B', 'oak'),
      line('end'),
    ];
    expect(kindsAt(lines, 3, 'a')).toEqual(['Text']);
    expect(kindsAt(lines, 5, 'a')).toEqual(['Brush']);
    expect(kindsAt(lines, 6, 'a')).toEqual(['Brush', 'Text']);
    expect(kindsAt(lines, 9, 'b')).toEqual(['Text']);
  });

  it('joins what a loop leaves after no round and after its rounds', () => {
    const lines = [
      set('C', '1'),
      line('repeat', { variable: 'I', from: '0', to: '3', step: '1' }),
      line('echo', { value: '[C]' }),
      line('cube', { into: 'C' }),
      line('end'),
    ];
    expect(kindsAt(lines, 2, 'c')).toEqual(['Brush', 'Number']);
    expect(kindsAt(lines, 5, 'c')).toEqual(['Brush', 'Number']);
    expect(kindsAt(lines, 2, 'i')).toEqual(['Number']);
  });

  it('gives a Function input the kinds of the values every Call gives it', () => {
    const lines = [
      line('cube', { into: 'Henry' }),
      line('function', { name: 'F', parameters: 'B' }),
      line('echo', { value: '[Local.B]' }),
      line('end'),
      line('call', { name: 'F', values: '[Henry]' }),
    ];
    expect(kindsAt(lines, 2, 'local.b')).toEqual(['Brush']);
    expect(kindsAt([...lines, line('call', { name: 'F', values: '4' })], 2, 'local.b')).toEqual(['Brush', 'Number']);
    expect(kindsAt(lines, 5, 'local.b')).toEqual([]);
  });

  it('gives Result In what the Function returns', () => {
    const lines = [
      line('function', { name: 'G', parameters: 'Of' }),
      line('return', { value: '[Local.Of.Faces]' }),
      line('end'),
      line('cube', { into: 'Box' }),
      line('call', { name: 'G', values: '[Box]', result: 'R' }),
    ];
    expect(kindsAt(lines, 5, 'r')).toEqual(['Face List']);
  });

  it('gives a name reused by a Repeat and a For Each the kind of each loop', () => {
    const lines = [
      line('repeat', { variable: 'I', from: '0', to: '3', step: '1' }),
      line('echo', { value: '[I]' }),
      line('end'),
      line('for_each', { variable: 'I', list: '[$Selected.Faces]' }),
      line('echo', { value: '[I]' }),
      line('end'),
    ];
    expect(kindsAt(lines, 1, 'i')).toEqual(['Number']);
    expect(kindsAt(lines, 4, 'i')).toEqual(['Face']);
    expect(kindsAt(lines, 6, 'i')).toEqual(['Face', 'Number']);
  });
});
