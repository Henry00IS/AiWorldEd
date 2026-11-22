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
    solidScriptDocumentCreate([{ command: 'echo', values: { value: `[=${formula}]` } }]),
    {},
  );
  return result.error ? result.error.message : (result.messages[0] ?? '');
}

/** A matrix whose bottom row is 1, 2, 3, 1, so W is X + 2Y + 3Z + 1. */
const PERSPECTIVE = 'MatrixTranspose(Transform(Vector(1, 2, 3), Vector(0, 0, 0), Vector(1, 1, 1)))';

describe('projecting points with a matrix', () => {
  it('places a point with TransformPoint by the top three rows only, ignoring the bottom row', () => {
    expect(formula(`TransformPoint(${PERSPECTIVE}, Vector(1, 0, 0))`)).toBe('[1, 0, 0]');
  });

  it('divides by W with ProjectPoint', () => {
    expect(formula(`ProjectPoint(${PERSPECTIVE}, Vector(1, 0, 0))`)).toBe('[0.5, 0, 0]');
  });

  it('divides by the size of W, so a point behind is not flipped', () => {
    expect(formula(`ProjectPoint(${PERSPECTIVE}, Vector(-2, 0, 0))`)).toBe('[-2, 0, 0]');
  });

  it('gives the origin when W is 0', () => {
    expect(formula(`ProjectPoint(${PERSPECTIVE}, Vector(-1, 0, 0))`)).toBe('[0, 0, 0]');
  });
});
