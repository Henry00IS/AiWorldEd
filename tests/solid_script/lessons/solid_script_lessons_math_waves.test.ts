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

describe('waves, checkerboard, Smootherstep and coordinates', () => {
  it('eases Smootherstep from 0 to 1, flat outside the edges', () => {
    expect(formula('Smootherstep(0, 10, -5)')).toBe('0');
    expect(formula('Smootherstep(0, 10, 5)')).toBe('0.5');
    expect(formula('Smootherstep(0, 10, 20)')).toBe('1');
    expect(Number(formula('Smootherstep(0, 10, 1)'))).toBeLessThan(Number(formula('Smoothstep(0, 10, 1)')));
  });

  it('repeats Saw and Triangle every whole step, per axis', () => {
    expect(formula('Saw(2.25)')).toBe('0.25');
    expect(formula('Saw(-0.25)')).toBe('0.75');
    expect(formula('Triangle(0.5)')).toBe('1');
    expect(formula('Triangle(Vector(0, 0.25, 1))')).toBe('[0, 0.5, 0]');
  });

  it('alternates Checker between neighbouring squares, smaller with Scale', () => {
    expect(formula('Checker(Vector(0.5, 0.5, 0.5))')).toBe('0');
    expect(formula('Checker(Vector(1.5, 0.5, 0.5))')).toBe('1');
    expect(formula('Checker(Vector(-0.5, 0.5, 0.5))')).toBe('1');
    expect(formula('Checker(0.75, 2)')).toBe('1');
    expect(formula('Checker(1)')).toBe('0');
  });

  it('flips a vector toward a reference only when it points away', () => {
    expect(formula('FlipToward(Vector(0, -1, 0), Vector(0, 1, 0))')).toBe('[0, 1, 0]');
    expect(formula('FlipToward(Vector(1, 2, 0), Vector(0, 1, 0))')).toBe('[1, 2, 0]');
  });

  it('builds points from cylinder and sphere coordinates and reads them back', () => {
    expect(formula('FromCylinder(2, 0, 1)')).toBe('[2, 1, 0]');
    expect(formula('ToCylinder(Vector(0, 3, 2))')).toBe('[2, 90, 3]');
    expect(formula('Round(ToCylinder(FromCylinder(3, 60, 4)) * 1000) / 1000')).toBe('[3, 60, 4]');
    expect(formula('FromSphere(2, 0, 0)')).toBe('[2, 0, 0]');
    expect(formula('ToSphere(Vector(0, 2, 0))')).toBe('[2, 0, 90]');
    expect(formula('Round(ToSphere(FromSphere(5, 120, 30)) * 1000) / 1000')).toBe('[5, 120, 30]');
  });
});
