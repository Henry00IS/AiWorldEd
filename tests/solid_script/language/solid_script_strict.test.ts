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

  it('explains text in a formula that needs double quotes', () => {
    const formula = (text: string) =>
      failure({ command: 'variable', values: { name: 'a', value: `[=${text}]` } }, { command: 'cube' });
    expect(formula('IsString(3e)')).toContain(`3e isn't a number; for text write "3e"`);
    expect(formula('1.2.3')).toContain(`1.2.3 isn't a number; for text write "1.2.3"`);
    expect(formula("IsString('3e')")).toContain(`text in a formula takes double quotes; write "3e"`);
    expect(formula('IsString(hello)')).toContain(`for text write "hello"`);
    expect(formula('IsString("3e")')).toBe('');
  });

  it('refuses values of the wrong kind instead of using a default', () => {
    expect(failure({ command: 'cube', values: { size: 'big' } })).toBe(
      'Line 1: Size needs a number, or 3 numbers separated by commas such as 1, 2, 3, not "big" (Text).',
    );
    expect(failure({ command: 'cube', values: { size: '1, 2, 3, 4' } })).toBe(
      'Line 1: Size needs a number, or 3 numbers separated by commas such as 1, 2, 3, not [1, 2, 3, 4] (Number List).',
    );
    expect(failure({ command: 'cube', values: { anchor: 'Middle, Bottom, Back' } })).toBe(
      'Line 1: Anchor takes Left, Center, Right for X, not "Middle, Bottom, Back" (Text).',
    );
    expect(failure({ command: 'cube', values: { anchor: 'Center, Bottom' } })).toBe(
      'Line 1: Anchor needs 3 words separated by commas, such as Center, Center, Center, not "Center, Bottom" (Text).',
    );
  });

  it('refuses formulas that have no meaning', () => {
    expect(failure({ command: 'cube', values: { size: '[="a" * 2]' } })).toMatch(
      /^Line 1: Size: \* needs numbers, but "a" is a Text, not a number\.$/,
    );
    expect(failure({ command: 'cube', values: { size: '[=1 / 0]' } })).toBe(
      'Line 1: Size: division by zero; check that what is divided by cannot be 0.',
    );
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

  it('runs empty blocks as nothing, with a warning on their line', () => {
    const lines: SolidScriptLine[] = [
      { command: 'cube' },
      { command: 'transform', values: { offset: '1, 0, 0' } },
      { command: 'end' },
      { command: 'texture', values: { texture: '' } },
      { command: 'end' },
      { command: 'repeat', values: { name: 'i', from: '1', to: '3' } },
      { command: 'end' },
    ];
    expect(failure(...lines)).toBe('');
    const result = solidScriptProgramEvaluate(solidScriptDocumentCreate(lines));
    expect(result.steps).toEqual([1]);
    expect(result.warnings).toEqual([
      { line: 2, text: 'Transform has nothing inside, so it does nothing.' },
      { line: 4, text: 'Texture has nothing inside, so it does nothing.' },
      { line: 6, text: 'Repeat has nothing inside, so it does nothing.' },
    ]);
  });

  it('counts Input Objects as output, even where it passes on nothing', () => {
    expect(failure({ command: 'input_objects' })).toBe('');
  });

  it('only warns about scripts that build nothing, after they ran', () => {
    const lines: SolidScriptLine[] = [
      { command: 'variable', values: { name: 'x', value: '1' } },
      { command: 'echo', values: { value: '[x]' } },
    ];
    expect(failure(...lines)).toBe('');
    const result = solidScriptProgramRun(solidScriptDocumentCreate(lines));
    expect(result.messages).toEqual(['1']);
    expect(result.warnings).toEqual([
      { line: null, text: 'The script builds no objects; add one such as Cube, or Output a variable.' },
    ]);
  });

  it('keeps the output and variables from before an error', () => {
    const result = solidScriptProgramRun(
      solidScriptDocumentCreate([
        { command: 'echo', values: { value: '5+5' } },
        { command: 'variable', values: { name: 'Width', value: '45$,8' } },
        { command: 'cube', values: { size: '1,[=Number([Width])],3' } },
      ]),
    );
    expect(result.error?.line).toBe(3);
    expect(result.messages).toEqual(['5+5']);
    expect(result.variables.map((variable) => [variable.name, variable.value, variable.type])).toEqual([
      ['Width', '45,8', 'Text'],
    ]);
  });

  it('stops runaway loops before the editor freezes', () => {
    const started = performance.now();
    const text = failure(
      { command: 'repeat', values: { variable: 'i', from: '0', to: '10000' } },
      { command: 'repeat', values: { variable: 'j', from: '0', to: '10000' } },
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
      { command: 'transform', values: { move: '2, 0, 0' } },
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
    expect(result.messages).toEqual(['6 Yes']);
  });
});
