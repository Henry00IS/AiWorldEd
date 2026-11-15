import { describe, expect, it } from 'vitest';
import { solidScriptProgramEvaluate, solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Returns the error a source stops with.
 *
 * @param source Source text.
 * @returns Error text, or an empty string when it runs.
 */
function failure(source: string): string {
  return solidScriptProgramRun(source).error?.text ?? '';
}

describe('SolidScript stops at the first mistake', () => {
  it('names a variable that does not exist and the ones that do', () => {
    expect(failure('width = 2;\ncube(wdth);')).toBe('Line 2: "wdth" is not a variable here. Known here: width.');
  });

  it('refuses values of the wrong type instead of using a default', () => {
    expect(failure('cube(size = "big");')).toBe(
      'Line 1: cube(): size must be a number or a list of 3 numbers, not "big".',
    );
    expect(failure('cube([1, 2]);')).toBe('Line 1: cube(): size must be a number or a list of 3 numbers, not [1, 2].');
    expect(failure('cube(1, center = 5);')).toBe('Line 1: cube(): center must be true or false, not 5.');
  });

  it('refuses arithmetic that has no meaning', () => {
    expect(failure('cube("a" * 2);')).toBe('Line 1: cannot use * on "a" and 2.');
    expect(failure('cube([1, 2, 3] + [1, 2]);')).toBe('Line 1: cannot use + on lists of 3 and 2 numbers.');
  });

  it('refuses numbers that are not finite', () => {
    expect(failure('cube(1 / 0);')).toBe('Line 1: division by zero.');
    expect(failure('sphere(r = sqrt(-1));')).toBe('Line 1: sphere(): r must be a number, not NaN.');
  });

  it('refuses values a command does not have', () => {
    expect(failure('cube(sise = 2);')).toBe('Line 1: cube() has no value "sise". Its values: size, center.');
    expect(failure('sphere(1, 2);')).toBe('Line 1: sphere() takes at most 1 value in order, not 2.');
  });

  it('refuses sizes out of range', () => {
    expect(failure('sphere(r = -1);')).toBe('Line 1: sphere(): r must be greater than 0, not -1.');
    expect(failure('cube([1, 0, 1]);')).toBe('Line 1: cube(): every size must be greater than 0, not [1, 0, 1].');
    expect(failure('cylinder(h = 0);')).toBe('Line 1: cylinder(): h must be greater than 0, not 0.');
  });

  it('refuses empty blocks and scripts that build nothing', () => {
    expect(failure('union() {\n}')).toBe('Line 1: union() has nothing inside; add a shape before its End.');
    expect(failure('x = 1;')).toBe('The script builds no solids; add a shape such as Cube.');
  });

  it('stops runaway loops before the editor freezes', () => {
    const started = performance.now();
    const text = failure('for (i = [0 : 9999]) {\nfor (j = [0 : 9999]) {\nif (i < 0) {\ncube(1);\n}\n}\n}');
    expect(text).toMatch(/^Line \d: the script needs too much work: more than [\d,]+ steps\. Lower a Repeat count\.$/);
    expect(performance.now() - started).toBeLessThan(3000);
  });

  it('pauses at the failing line, keeping what the lines before it built', () => {
    const run = solidScriptProgramRun('cube(1);\ntranslate([2, 0, 0]) cube(1);\nsphere(r = nope);\ncube(3);');
    expect(run.error).toMatchObject({ line: 3 });
    expect(run.steps).toEqual([1, 2]);
    expect(run.shapes).toHaveLength(2);
    expect(() => solidScriptProgramEvaluate('cube(1);\nsphere(r = nope);')).toThrow(
      /^line 2: "nope" is not a variable/,
    );
  });
});
