import { describe, expect, it } from 'vitest';
import { solidScriptProgramEvaluate, solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';

/**
 * Returns the error lines stop with.
 *
 * @param lines Lines.
 * @returns Error text, or an empty string when they run.
 */
function failure(...lines: SolidScriptLine[]): string {
  return solidScriptProgramRun(solidScriptDocumentCreate(lines)).error?.text ?? '';
}

describe('SolidScript stops at the first mistake', () => {
  it('names a variable that does not exist', () => {
    expect(
      failure(
        { command: 'variable', values: { name: 'width', value: '2' } },
        { command: 'cube', values: { size: '[wdth]' } },
      ),
    ).toBe('Line 2: Size: there is no variable [wdth]; set it on a line above this one.');
  });

  it('refuses values of the wrong kind instead of using a default', () => {
    expect(failure({ command: 'cube', values: { size: 'big' } })).toBe(
      'Line 1: Size needs a number, or 3 numbers separated by commas such as 1, 2, 3, not "big" (Text).',
    );
    expect(failure({ command: 'cube', values: { size: '1, 2' } })).toBe(
      'Line 1: Size needs a number, or 3 numbers separated by commas such as 1, 2, 3, not [1, 2] (Vector).',
    );
    expect(failure({ command: 'cube', values: { center: '5' } })).toBe(
      'Line 1: Center needs Yes or No, not "5" (Whole Number).',
    );
  });

  it('refuses formulas that have no meaning', () => {
    expect(failure({ command: 'cube', values: { size: '[="a" * 2]' } })).toMatch(
      /^Line 1: Size: \* needs numbers, but "a" is Text, not a number\.$/,
    );
    expect(failure({ command: 'cube', values: { size: '[=1 / 0]' } })).toBe('Line 1: Size: division by zero.');
    expect(failure({ command: 'sphere', values: { r: '[=sqrt(-1)]' } })).toBe(
      'Line 1: Radius needs a number, such as 2, not NaN.',
    );
  });

  it('refuses unbalanced brackets in a field', () => {
    expect(failure({ command: 'sphere', values: { r: '[radius' } })).toBe(
      'Line 1: Radius: a [ has no ] after it; write $[ for a bracket.',
    );
  });

  it('refuses sizes and counts out of range', () => {
    expect(failure({ command: 'sphere', values: { r: '-1' } })).toBe('Line 1: Radius must be greater than 0, not -1.');
    expect(failure({ command: 'cylinder', values: { h: '0' } })).toBe('Line 1: Height must be greater than 0, not 0.');
    expect(failure({ command: 'cylinder', values: { sides: '100' } })).toMatch(/^Line 1: Sides /);
  });

  it('refuses empty blocks and scripts that build nothing', () => {
    expect(failure({ command: 'union' }, { command: 'end' })).toBe(
      'Line 1: Union has nothing inside; add a shape before its End.',
    );
    expect(failure({ command: 'variable', values: { name: 'x', value: '1' } })).toBe(
      'The script builds no shapes; add a shape such as Cube.',
    );
  });

  it('stops runaway loops before the editor freezes', () => {
    const started = performance.now();
    const text = failure(
      { command: 'repeat', values: { variable: 'i', from: '0', to: '9999' } },
      { command: 'repeat', values: { variable: 'j', from: '0', to: '9999' } },
      { command: 'if', values: { condition: '[i] < 0' } },
      { command: 'cube' },
      { command: 'end' },
      { command: 'end' },
      { command: 'end' },
    );
    expect(text).toMatch(/^Line \d: the script stopped after [\d,]+ steps/);
    expect(performance.now() - started).toBeLessThan(3000);
  });

  it('pauses at the failing line, keeping what the lines before it built', () => {
    const lines: SolidScriptLine[] = [
      { command: 'cube' },
      { command: 'translate', values: { v: '2, 0, 0' } },
      { command: 'cube' },
      { command: 'end' },
      { command: 'sphere', values: { r: '[nope]' } },
      { command: 'cube', values: { size: '3' } },
    ];
    const run = solidScriptProgramRun(solidScriptDocumentCreate(lines));
    expect(run.error).toMatchObject({ line: 5 });
    expect(run.steps).toEqual([1, 3]);
    expect(run.shapes).toHaveLength(2);
    expect(() => solidScriptProgramEvaluate(solidScriptDocumentCreate(lines))).toThrow(
      /^line 5: Radius: there is no variable \[nope\]/,
    );
  });

  it('treats text that spells a number as that number, like the plain text values of the reference', () => {
    const run = (...lines: SolidScriptLine[]) => solidScriptProgramRun(solidScriptDocumentCreate(lines), {});
    const result = run(
      { command: 'variable', values: { name: 'w', value: '[=str(3)]' } },
      { command: 'echo', values: { value: '[=[w] * 2] [=[w] == 3]' } },
      { command: 'cube', values: { size: '[w], 1, 1' } },
    );
    expect(result.error).toBeNull();
    expect(result.messages).toEqual(['6 true']);
  });
});
