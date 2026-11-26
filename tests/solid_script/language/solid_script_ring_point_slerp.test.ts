import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { SOLID_SCRIPT_FUNCTION_DOCS } from '@/solid_script/language/solid_script_function_docs.js';
import {
  SOLID_SCRIPT_FORMULA_FUNCTION,
  solidScriptFormulaCatalog,
} from '@/solid_script/commands/solid_script_formula_commands.js';

/**
 * Evaluates one formula and returns its value, or the error.
 *
 * @param formula Formula without [= ].
 * @returns Numbers, or the message.
 */
function value(formula: string): number[] | string {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([
      { command: 'variable', values: { name: 'Out', value: `[=${formula}]` } },
      { command: 'echo', values: { value: '[=Round([Out] * 1000000) / 1000000]' } },
      { command: 'cube', values: {} },
    ]),
    {},
  );
  if (result.error) return result.error.message;
  const printed = result.messages[0] ?? '';
  return printed
    .replace(/[[\]]/g, '')
    .split(',')
    .map((part) => Number(part) + 0);
}

describe('RingPoint', () => {
  it('starts along X and turns counter-clockwise seen from above, 90 to the back', () => {
    expect(value('RingPoint(0, 4)')).toEqual([2, 0, 0]);
    expect(value('RingPoint(90, 4)')).toEqual([0, 0, -2]);
    expect(value('RingPoint(180, 4, 1.5)')).toEqual([-2, 1.5, 0]);
    expect(value('RingPoint(270, 4)')).toEqual([0, 0, 2]);
  });

  it('takes a full size as a vector, using its width and depth, so a box size fits the box', () => {
    expect(value('RingPoint(0, Vector(6, 9, 2))')).toEqual([3, 0, 0]);
    expect(value('RingPoint(90, Vector(6, 9, 2), -1)')).toEqual([0, -1, -1]);
    expect(value('RingPoint(90, [6, 2])')).toEqual([0, 0, -1]);
  });

  it('turns the way Cos and Sin do, for any angle', () => {
    expect(value('RingPoint(30, Vector(4, 0, 2))')).toEqual(value('Vector(Cos(30) * 2, 0, -Sin(30))'));
  });

  it('stops on a size that is not a number or a vector', () => {
    expect(value('RingPoint(0, "wide")')).toMatch(/RingPoint/);
  });

  it('is documented as a Vector function', () => {
    expect(SOLID_SCRIPT_FUNCTION_DOCS['ring_point']?.usage).toBe('RingPoint(degrees, size, height)');
  });
});

describe('Slerp', () => {
  it('turns from one direction to another at an even rate', () => {
    expect(value('Slerp(Vector(1, 0, 0), Vector(0, 1, 0), 0)')).toEqual([1, 0, 0]);
    expect(value('Slerp(Vector(1, 0, 0), Vector(0, 1, 0), 1)')).toEqual([0, 1, 0]);
    const half = Math.round(Math.SQRT1_2 * 1e6) / 1e6;
    expect(value('Slerp(Vector(1, 0, 0), Vector(0, 1, 0), 0.5)')).toEqual([half, half, 0]);
    const third = value('Slerp(Vector(1, 0, 0), Vector(0, 0, 1), 1 / 3)');
    expect(third).toEqual([Math.round(Math.cos(Math.PI / 6) * 1e6) / 1e6, 0, 0.5]);
  });

  it('blends the lengths, so points on a sphere stay on it', () => {
    expect(value('Slerp(Vector(2, 0, 0), Vector(0, 4, 0), 1)')).toEqual([0, 4, 0]);
    expect(value('Length(Slerp(Vector(2, 0, 0), Vector(0, 4, 0), 0.5))')).toEqual([3]);
    expect(value('Length(Slerp(Vector(3, 0, 0), Vector(0, 0, 3), 0.25))')).toEqual([3]);
  });

  it('handles the same direction and opposite directions', () => {
    expect(value('Slerp(Vector(0, 1, 0), Vector(0, 2, 0), 0.5)')).toEqual([0, 1.5, 0]);
    const opposite = value('Slerp(Vector(1, 0, 0), Vector(-1, 0, 0), 0.5)') as number[];
    expect(Math.hypot(...opposite)).toBeCloseTo(1, 6);
    expect(opposite[0]).toBeCloseTo(0, 6);
    expect(value('Slerp(Vector(0, 1, 0), Vector(0, -1, 0), 1)')).toEqual([0, -1, 0]);
  });

  it('works on flat vectors too', () => {
    const half = Math.round(Math.SQRT1_2 * 1e6) / 1e6;
    expect(value('Slerp([1, 0], [0, 1], 0.5)')).toEqual([half, half]);
    expect(value('Slerp(Vector(1, 0), [0, 1], 0.5)')).toEqual([half, half, 0]);
  });

  it('stops on vectors that are no vectors or have no length', () => {
    expect(value('Slerp(Vector(1, 0, 0), [0, 1, 0, 1], 0.5)')).toMatch(/Slerp/);
    expect(value('Slerp(Vector(0, 0, 0), Vector(0, 1, 0), 0.5)')).toMatch(/Slerp/);
  });
});

describe('RingPoint and Slerp in the editor', () => {
  it('get a block in the formula palette', () => {
    const formula = solidScriptFormulaCatalog();
    expect(formula.find(`${SOLID_SCRIPT_FORMULA_FUNCTION}ring_point`)?.label).toBeDefined();
    expect(formula.find(`${SOLID_SCRIPT_FORMULA_FUNCTION}slerp`)?.label).toBeDefined();
  });
});
