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

const POINTS = '[Vector(0, 0, 0), Vector(1, 0, 0), Vector(5, 0, 0), Vector(6, 0, 0)]';

describe('Nearest within a group', () => {
  it('only looks at points whose group matches Group', () => {
    expect(formula(`Nearest(${POINTS}, Vector(1.2, 0, 0), -1, [1, 1, 2, 2], 2)`)).toBe('2');
    expect(formula(`Nearest(${POINTS}, Vector(5.6, 0, 0), -1, [1, 1, 2, 2], 1)`)).toBe('1');
  });

  it('skips the point itself inside its group, and gives -1 when the group has no other point', () => {
    expect(formula(`Nearest(${POINTS}, Vector(5, 0, 0), 2, [1, 1, 2, 2], 2)`)).toBe('3');
    expect(formula(`Nearest(${POINTS}, Vector(5, 0, 0), 2, [1, 1, 2, 3], 2)`)).toBe('-1');
  });

  it('searches every point when Groups is left off, and refuses a Groups list of another length', () => {
    expect(formula(`Nearest(${POINTS}, Vector(1.2, 0, 0))`)).toBe('1');
    expect(formula(`Nearest(${POINTS}, Vector(1.2, 0, 0), -1, [1, 2], 1)`)).toContain('one group per point');
  });
});
