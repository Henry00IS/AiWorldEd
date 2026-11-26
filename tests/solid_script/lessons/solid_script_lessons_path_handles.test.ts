import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/** A straight 3 m path from the origin along X, in [P]. */
const LINE: SolidScriptLine = {
  command: 'path_from_points',
  values: { points: '[0, 0, 0], [3, 0, 0]', into: 'P' },
};

/**
 * Runs lines after the straight path and prints what Echo reads.
 *
 * @param lines Lines after the path.
 * @param echo What to print.
 * @returns Printed text, or the error.
 */
function ran(lines: SolidScriptLine[], echo = '[P.Points]'): string {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([LINE, ...lines, { command: 'echo', values: { value: echo } }, { command: 'cube' }]),
  );
  return result.error?.message ?? result.messages[0] ?? '';
}

describe('Path handles and types', () => {
  it('bends a path between the handles Set Handles gives each point', () => {
    const handles = { path: '[P]', left: '2, 3, 0', right: '1, 3, 0', resolution: '2', into: 'P' };
    expect(ran([{ command: 'set_handles', values: handles }])).toBe('[[0, 0, 0], [1.5, 2.25, 0], [3, 0, 0]]');
  });

  it('reads the handles back per point', () => {
    const handles = { path: '[P]', left: '2, 3, 0', right: '1, 3, 0', into: 'P' };
    expect(ran([{ command: 'set_handles', values: handles }], '[P.HandlesRight(0)] [P.HandlesLeft(1)]')).toBe(
      '[1, 3, 0] [2, 3, 0]',
    );
  });

  it('turns a straight path into a Bezier one of the same shape, and back', () => {
    const bezier = { command: 'set_path_type', values: { path: '[P]', type: 'Bezier', resolution: '3', into: 'P' } };
    expect(ran([bezier])).toBe('[[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0]]');
    expect(ran([bezier, { command: 'set_path_type', values: { path: '[P]', type: 'Poly', into: 'P' } }])).toBe(
      '[[0, 0, 0], [3, 0, 0]]',
    );
  });

  it('stops on a Type that is not Poly or Bezier', () => {
    expect(ran([{ command: 'set_path_type', values: { path: '[P]', type: 'Wavy', into: 'P' } }])).toContain(
      'Poly, Bezier, Catmull Rom or NURBS',
    );
  });
});
