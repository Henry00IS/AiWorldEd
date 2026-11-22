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

describe('Rotation math', () => {
  it('undoes a turn with InvertRotation', () => {
    expect(formula('InvertRotation(Vector(0, 90, 0))')).toBe('[0, -90, 0]');
    expect(formula('InvertRotation(InvertRotation(Vector(10, 20, 30)))')).toBe('[10, 20, 30]');
  });

  it('reads the axis and angle of a turn', () => {
    expect(formula('RotationAxis(Vector(0, 90, 0))')).toBe('[0, 1, 0]');
    expect(formula('RotationAngle(Vector(0, -90, 0))')).toBe('90');
    expect(formula('RotationAxis(Vector(0, 0, 0))')).toBe('[1, 0, 0]');
  });

  it('blends two turns the shortest way with MixRotation', () => {
    expect(formula('MixRotation(Vector(0, 0, 0), Vector(0, 90, 0), 0.5)')).toBe('[0, 45, 0]');
  });

  it('stops on a turn that is not a Vector', () => {
    expect(formula('InvertRotation(1)')).toContain('Vector');
  });
});
