import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Runs lines and gives the echoed text or the mistake.
 *
 * @param lines Lines.
 * @returns Text.
 */
function ran(...lines: SolidScriptLine[]): string {
  const result = solidScriptProgramRun(solidScriptDocumentCreate(lines));
  return result.error?.message ?? result.messages.join('|');
}

describe('Points', () => {
  it('makes Count points, each at the At worked out for its index', () => {
    expect(
      ran(
        { command: 'points', values: { count: '3', at: '[=Vector([$Index] * 2, [$Count], 0)]', into: 'P' } },
        { command: 'echo', values: { value: '[P]' } },
      ),
    ).toBe('[[0, 3, 0], [2, 3, 0], [4, 3, 0]]');
  });

  it('makes none for Count 0 and stops on a bad Count or At', () => {
    expect(
      ran(
        { command: 'points', values: { count: '0', into: 'P' } },
        { command: 'echo', values: { value: '[P.Count]' } },
      ),
    ).toBe('0');
    expect(ran({ command: 'points', values: { count: '1.5', into: 'P' } })).toMatch(/Count needs a whole number/);
    expect(ran({ command: 'points', values: { count: '2', at: '1, 2, 3, 4', into: 'P' } })).toMatch(
      /At needs a vector/,
    );
    expect(
      ran(
        { command: 'points', values: { count: '2', at: '1, 2', into: 'P' } },
        { command: 'echo', values: { value: '[P]' } },
      ),
    ).toBe('[[1, 2, 0], [1, 2, 0]]');
  });
});
