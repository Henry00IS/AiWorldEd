import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';

/**
 * Runs lines and returns the result.
 *
 * @param lines Lines.
 * @returns Run result.
 */
function run(...lines: SolidScriptLine[]) {
  return solidScriptProgramRun(
    solidScriptDocumentCreate([...lines, { command: 'cube', values: { anchor: 'Center, Center, Center' } }]),
  );
}

/**
 * An Echo line.
 *
 * @param value Message.
 * @returns Line.
 */
function echo(value: string): SolidScriptLine {
  return { command: 'echo', values: { value } };
}

describe('names ignore case', () => {
  it('make count and Count one variable, shown with the spelling of its first Set', () => {
    const result = run(
      { command: 'variable', values: { name: 'Count', value: '2' } },
      { command: 'variable', values: { name: 'count', value: '[=[COUNT] + 1]' } },
      echo('[count] [Count]'),
    );
    expect(result.error).toBeNull();
    expect(result.messages).toEqual(['3 3']);
    expect(result.variables.map((variable) => variable.name)).toContain('Count');
    expect(result.variables.map((variable) => variable.name)).not.toContain('count');
  });

  it('give an Input the value stored under another spelling of its name', () => {
    const lines = solidScriptDocumentCreate([
      { command: 'input', values: { name: 'TopSize', type: 'Number', default: '1' } },
      echo('[TopSize]'),
      { command: 'cube', values: { anchor: 'Center, Center, Center' } },
    ]);
    expect(solidScriptProgramRun(lines, { inputs: { topSize: '0.5' } }).messages).toEqual(['0.5']);
  });

  it('match inputs, counters, Function names, local. and persistent. whatever their case', () => {
    const result = run(
      { command: 'input', values: { name: 'Steps', type: 'Count', default: '2' } },
      { command: 'function', values: { name: 'Twice', parameters: 'Value' } },
      { command: 'return', values: { value: '[=[LOCAL.value] * 2]' } },
      { command: 'end' },
      { command: 'repeat', values: { variable: 'I', from: '1', to: '[steps]' } },
      echo('[=twice([i])]'),
      { command: 'end' },
      { command: 'variable', values: { name: 'Persistent.Total', value: '7' } },
      echo('[persistent.total]'),
    );
    expect(result.error?.message ?? null).toBeNull();
    expect(result.messages).toEqual(['2', '4', '7']);
  });

  it('read built-in values and functions in any case, old snake_case spellings included', () => {
    const result = run(
      echo('[=Round(Sin(90) * 10)] [=round(sin(90) * 10)] [=Floor($MATH.PI)] [=floor($Math.Pi)]'),
      echo('[=CharacterCode("A")] [=character_code("A")]'),
      echo('[=True] [=TRUE] [=$Math.Pi > 3]'),
    );
    expect(result.error).toBeNull();
    expect(result.messages).toEqual(['10 10 3 3', '65 65', 'Yes Yes Yes']);
  });

  it('reads members such as Face.Center in any case', () => {
    const result = solidScriptProgramRun(
      solidScriptDocumentCreate([
        { command: 'cube', values: { size: '2, 2, 2', anchor: 'Center, Center, Center' } },
        { command: 'select_faces', values: { which: 'Up' } },
        { command: 'for_each', values: { variable: 'Face', list: '[$Selected.Faces]' } },
        echo('[face.center.y] [FACE.CENTER.Y]'),
        { command: 'end' },
      ]),
    );
    expect(result.error?.message ?? null).toBeNull();
    expect(result.messages).toEqual(['1 1']);
  });
});
