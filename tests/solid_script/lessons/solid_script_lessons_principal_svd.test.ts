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

const LINE = 'List(Vector(-2, 1, 0), Vector(0, 1, 0), Vector(2, 1, 0), Vector(0, 1.5, 0), Vector(0, 0.5, 0))';

describe('PrincipalAxes', () => {
  it('gives the axes of a point cloud, the widest spread first', () => {
    expect(formula(`PrincipalAxes(${LINE})`)).toBe('[[1, 0, 0], [0, 1, 0], [0, 0, 1]]');
  });

  it('gives the middle and the spread along each axis', () => {
    expect(formula(`PrincipalAxes(${LINE}, "Center")`)).toBe('[0, 1, 0]');
    expect(formula(`PrincipalAxes(${LINE}, "Spread")`)).toBe('[1.264911064, 0.316227766, 0]');
  });

  it('finds a tilted axis', () => {
    expect(formula('First(PrincipalAxes(List(Vector(0, 0, 0), Vector(1, 1, 0), Vector(2, 2, 0))))')).toBe(
      '[0.707106781, 0.707106781, 0]',
    );
  });

  it('stops on fewer than one point', () => {
    expect(formula('PrincipalAxes(List())')).toContain('at least one point');
  });
});

describe('MatrixSvd', () => {
  it('gives the scale of a scaled turn as its singular values', () => {
    expect(formula('MatrixSvd(Transform(Vector(5, 0, 0), Vector(0, 30, 0), Vector(1, 3, 2)))')).toBe('[3, 2, 1]');
  });

  it('gives U and V that put the matrix back together with S', () => {
    const matrix = 'Transform(Vector(0, 0, 0), Vector(10, 20, 30), Vector(1, 2, 3))';
    const rebuilt = `MatrixMultiply(MatrixMultiply(MatrixSvd(${matrix}, "U"), Transform(Vector(0, 0, 0), Vector(0, 0, 0), MatrixSvd(${matrix}))), MatrixTranspose(MatrixSvd(${matrix}, "V")))`;
    const numbers = (text: string): number[] => text.replace(/[[\]]/g, '').split(',').map(Number);
    const got = numbers(formula(`TransformPoint(${rebuilt}, Vector(1, 2, 3))`));
    const want = numbers(formula(`TransformPoint(${matrix}, Vector(1, 2, 3))`));
    want.forEach((value, axis) => expect(got[axis]).toBeCloseTo(value, 6));
  });

  it('stops on an unknown output', () => {
    expect(formula('MatrixSvd(Transform(Vector(0, 0, 0), Vector(0, 0, 0), Vector(1, 1, 1)), "W")')).toContain(
      'S, U or V',
    );
  });
});
