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

const POINTS = '[Vector(0, 0, 0), Vector(0.5, 0, 0), Vector(5, 0, 0), Vector(1, 0, 0), Vector(5.2, 0, 0)]';

describe('Cluster', () => {
  it('gives each point the index of the first point within Distance of it, in list order', () => {
    expect(formula(`Cluster(${POINTS}, 0.6)`)).toBe('[0, 0, 2, 3, 2]');
  });

  it('keeps every point apart at the default Distance unless they touch', () => {
    expect(formula(`Cluster(${POINTS})`)).toBe('[0, 1, 2, 3, 4]');
    expect(formula('Cluster([Vector(1, 1, 1), Vector(1, 1, 1)])')).toBe('[0, 0]');
  });

  it('only joins points of the same group', () => {
    expect(formula(`Cluster(${POINTS}, 0.6, [1, 2, 1, 1, 1])`)).toBe('[0, 1, 2, 3, 2]');
  });

  it('stops on a groups list of the wrong length', () => {
    expect(formula(`Cluster(${POINTS}, 0.6, [1, 2])`)).toContain('one group per point');
  });
});
