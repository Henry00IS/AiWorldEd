import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';

const END: SolidScriptLine = { command: 'end' };

/**
 * Runs lines.
 *
 * @param lines Lines.
 * @returns Run result.
 */
function run(...lines: SolidScriptLine[]) {
  return solidScriptProgramRun(solidScriptDocumentCreate(lines));
}

/**
 * A Function that writes a message every time it runs and gives back a value.
 *
 * @param value Value it gives back.
 * @returns Lines.
 */
function loud(value: string): SolidScriptLine[] {
  return [
    { command: 'function', values: { name: 'Loud', parameters: '' } },
    { command: 'echo', values: { value: 'ran' } },
    { command: 'return', values: { value } },
    END,
  ];
}

describe('SolidScript optional fields are read once', () => {
  it('works out a Return value once, so a function called in it runs once', () => {
    const result = run(
      ...loud('7'),
      { command: 'function', values: { name: 'Outer', parameters: '' } },
      { command: 'return', values: { value: '[=Loud() + 1]' } },
      END,
      { command: 'echo', values: { value: '[=Outer()]' } },
    );
    expect(result.error).toBeNull();
    expect(result.messages).toEqual(['ran', '8']);
  });

  it('gives back numbers, Yes, No, zero and vectors from Return as they are', () => {
    const cases: [string, string][] = [
      ['0', '0'],
      ['[=1 > 2]', 'No'],
      ['[=1 < 2]', 'Yes'],
      ['[=Vector(1, 2, 3)]', '[1, 2, 3]'],
      ['plain words', 'plain words'],
    ];
    for (const [value, shown] of cases) {
      const result = run(...loud(value), { command: 'echo', values: { value: '[=Loud()]' } });
      expect(result.error).toBeNull();
      expect(result.messages).toEqual(['ran', shown]);
    }
  });

  it('treats a Return of blank text as a Return without a value', () => {
    const result = run({ command: 'variable', values: { name: 'Blank', value: '' } }, ...loud('[Blank]'), {
      command: 'echo',
      values: { value: '[=Loud()]' },
    });
    expect(result.error?.message).toMatch(/gives no value; end it with a Return that has a Value/);
    expect(result.messages).toEqual(['ran']);
  });

  it('lifts nothing when Lift of Extrude Face reads blank text, the same as leaving it empty', () => {
    const extrude = (lift: string) =>
      run(
        { command: 'variable', values: { name: 'Blank', value: '' } },
        { command: 'cube' },
        { command: 'select_objects' },
        { command: 'select_faces', values: { which: 'All' } },
        { command: 'extrude_face', values: { distance: '0.1', lift } },
      );
    const blank = extrude('[Blank]');
    expect(blank.error).toBeNull();
    expect(JSON.stringify(blank.shapes)).toBe(JSON.stringify(extrude('').shapes));
    expect(JSON.stringify(extrude('0.5').shapes)).not.toBe(JSON.stringify(blank.shapes));
  });

  it('uses no space when On of Transform reads blank text, the same as leaving it empty', () => {
    const moved = (on: string) =>
      run(
        { command: 'variable', values: { name: 'Blank', value: '' } },
        { command: 'transform', values: { move: '1, 2, 3', on } },
        { command: 'cube' },
        END,
      );
    const blank = moved('[Blank]');
    expect(blank.error).toBeNull();
    expect(JSON.stringify(blank.shapes)).toBe(JSON.stringify(moved('').shapes));
  });
});
