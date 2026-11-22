import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Evaluates one formula and returns what Echo prints, or the error.
 *
 * @param formula Formula without [= ].
 * @returns Printed value.
 */
function formula(formula: string): string {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([
      { command: 'echo', values: { value: `[=${formula}]` } },
      { command: 'cube', values: {} },
    ]),
    {},
  );
  return result.error ? result.error.message : (result.messages[0] ?? '');
}

describe('Clamp with reversed limits, Lerp per axis and Slice on text', () => {
  it('swaps reversed Clamp limits', () => {
    expect(formula('Clamp(12, 10, 0)')).toBe('10');
    expect(formula('Clamp(-3, 10, 0)')).toBe('0');
    expect(formula('Clamp(4, 10, 0)')).toBe('4');
    expect(formula('Clamp(12, 0, 10)')).toBe('10');
  });

  it('blends vectors by one amount per axis, and refuses a size mismatch', () => {
    expect(formula('Lerp(Vector(0, 0, 0), Vector(10, 10, 10), Vector(0, 0.5, 1))')).toBe('[0, 5, 10]');
    expect(formula('Lerp(Vector(0, 0, 0), Vector(10, 10, 10), 0.5)')).toBe('[5, 5, 5]');
    expect(formula('Lerp(0, 10, 0.25)')).toBe('2.5');
    expect(formula('Lerp(Vector(0, 0, 0), Vector(10, 10, 10), Vector(0, 1))')).toContain('per axis');
  });

  it('slices characters out of a text like items out of a list', () => {
    expect(formula('Slice("Tower", 1, 3)')).toBe('owe');
    expect(formula('Slice("Tower", 2)')).toBe('wer');
    expect(formula('Slice("Tower", -2, 3)')).toBe('Tow');
    expect(formula('Slice("Tower", 3, 10)')).toBe('er');
    expect(formula('Slice([4, 5, 6], 1, 2)')).toBe('[5, 6]');
  });
});

describe('stepped Remap', () => {
  it('jumps between even levels with Steps and slides without', () => {
    const levels = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) =>
      formula(`Remap(${value}, 0, 10, 0, 100, true, 4)`),
    );
    expect(new Set(levels)).toEqual(new Set(['0', '25', '50', '75', '100']));
    expect(formula('Remap(3, 0, 10, 0, 100, true, 0)')).toBe('30');
    expect(formula('Remap(3, 0, 10, 0, 100, true, -1)')).toContain('Steps of 0 or more');
  });
});

describe('eased Remap', () => {
  it('uses Smoothstep or Smootherstep when asked, Linear by default', () => {
    expect(formula('Remap(0.1, 0, 1, 0, 1, true, 0, "Smoothstep")')).toBe(formula('Smoothstep(0, 1, 0.1)'));
    expect(formula('Remap(0.1, 0, 1, 0, 1, true, 0, "Smootherstep")')).toBe(formula('Smootherstep(0, 1, 0.1)'));
    expect(formula('Remap(0.1, 0, 1, 0, 1)')).toBe('0.1');
    expect(formula('Remap(0.1, 0, 1, 0, 1, true, 0, "Other")')).toContain('needs Ease');
  });
});
