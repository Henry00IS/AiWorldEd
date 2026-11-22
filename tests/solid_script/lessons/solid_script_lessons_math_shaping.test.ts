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

describe('shaping math', () => {
  it('blends Min and Max smoothly over a Distance, plain at 0', () => {
    expect(formula('SmoothMin(1, 1, 1)')).toBe('0.75');
    expect(formula('SmoothMin(0, 5, 1)')).toBe('0');
    expect(formula('SmoothMin(2, 3, 0)')).toBe('2');
    expect(formula('SmoothMax(1, 1, 1)')).toBe('1.25');
    expect(formula('SmoothMin(Vector(0, 1, 2), Vector(5, 1, 0), 0)')).toBe('[0, 1, 0]');
  });

  it('bounces with PingPong between 0 and Length', () => {
    expect(formula('PingPong(3, 2)')).toBe('1');
    expect(formula('PingPong(5, 2)')).toBe('1');
    expect(formula('PingPong(1.5, 2)')).toBe('1.5');
    expect(formula('PingPong(-1, 2)')).toBe('1');
    expect(formula('PingPong(7, 0)')).toBe('0');
  });

  it('clamps Remap to the target range unless Clamp is No, and remaps vectors per axis', () => {
    expect(formula('Remap(15, 0, 10, 0, 100)')).toBe('100');
    expect(formula('Remap(15, 0, 10, 0, 100, false)')).toBe('150');
    expect(formula('Remap(-5, 0, 10, 100, 0)')).toBe('100');
    expect(formula('Remap(Vector(0, 5, 20), 0, 10, 0, 1)')).toBe('[0, 0.5, 1]');
  });

  it('gives running sums with Accumulate', () => {
    expect(formula('Accumulate(List(1, 2, 3))')).toBe('[1, 3, 6]');
    expect(formula('Accumulate(List())')).toBe('[]');
  });

  it('compares vectors axis by axis: Yes only when every axis holds', () => {
    expect(formula('Vector(1, 2, 3) < Vector(2, 3, 4)')).toBe('Yes');
    expect(formula('Vector(1, 5, 3) < Vector(2, 3, 4)')).toBe('No');
    expect(formula('Vector(1, 2, 3) >= Vector(1, 2, 3)')).toBe('Yes');
  });

  it('keeps % truncated like most languages and Mod floored, as the help says', () => {
    expect(formula('-7 % 3')).toBe('-1');
    expect(formula('Mod(-7, 3)')).toBe('2');
  });
});

describe('vector math', () => {
  it('projects onto a direction with ProjectOnto and onto a plane with ProjectOnPlane', () => {
    expect(formula('ProjectOnto(Vector(2, 3, 0), Vector(1, 0, 0))')).toBe('[2, 0, 0]');
    expect(formula('ProjectOnto(Vector(2, 2, 0), Vector(0, 0, 5))')).toBe('[0, 0, 0]');
    expect(formula('ProjectOnPlane(Vector(3, 5, 1), Vector(0, 0, 0), Vector(0, 1, 0))')).toBe('[3, 0, 1]');
  });

  it('turns around a Center with RotateVector, and by angles per axis with RotateEuler', () => {
    expect(
      formula('Equal(RotateVector(Vector(2, 0, 0), Vector(0, 1, 0), 180, Vector(1, 0, 0)), Vector(0, 0, 0))'),
    ).toBe('Yes');
    expect(formula('Equal(RotateEuler(Vector(1, 0, 0), Vector(0, 90, 0)), Vector(0, 0, -1))')).toBe('Yes');
    expect(formula('Equal(RotateEuler(Vector(1, 0, 0), Vector(0, 0, 90)), Vector(0, 1, 0))')).toBe('Yes');
  });
});
