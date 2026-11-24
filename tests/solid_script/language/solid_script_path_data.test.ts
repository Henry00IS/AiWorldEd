import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/** A straight open path named P. */
const PATH: SolidScriptLine = {
  command: 'path',
  values: { shape: 'From Points', points: '[0, 0, 0], [3, 0, 0]', into: 'P' },
};

/**
 * Runs lines after the path and gives the mistake the run stopped at.
 *
 * @param lines Lines after the path.
 * @returns Mistake text, or an empty text when there was none.
 */
function mistake(...lines: SolidScriptLine[]): string {
  return solidScriptProgramRun(solidScriptDocumentCreate([PATH, ...lines, { command: 'cube' }])).error?.message ?? '';
}

describe('Data on a path', () => {
  it('stops a write with a clear message', () => {
    expect(mistake({ command: 'variable', values: { name: 'P.Data.Mark', value: '7' } })).toContain(
      'Paths have no Data',
    );
  });

  it('stops a read with the same message', () => {
    expect(mistake({ command: 'echo', values: { value: '[P.Data.Mark]' } })).toContain('Paths have no Data');
  });

  it('still keeps Data on solids', () => {
    expect(
      mistake(
        { command: 'cube', values: { into: 'Box' } },
        { command: 'variable', values: { name: 'Box.Data.Mark', value: '7' } },
      ),
    ).toBe('');
  });
});
