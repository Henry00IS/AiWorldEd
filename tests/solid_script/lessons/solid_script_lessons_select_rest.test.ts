import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Runs lines on a cube and gives the echoed texts, or the mistake.
 *
 * @param lines Lines after the cube.
 * @returns Texts.
 */
function ran(...lines: SolidScriptLine[]): string[] {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([{ command: 'cube', values: { size: '1' } }, { command: 'select_objects' }, ...lines]),
  );
  return result.error ? [result.error.message] : result.messages;
}

describe('Select Rest', () => {
  it('writes the faces Select Faces did not pick to Rest', () => {
    expect(
      ran(
        { command: 'select_faces', values: { which: 'Facing Up', into: 'Up', rest: 'Others' } },
        { command: 'echo', values: { value: '[Up.Count] [Others.Count]' } },
      ),
    ).toEqual(['1 5']);
  });

  it('writes the edges and corners left over too', () => {
    expect(
      ran(
        { command: 'select_vertices', values: { where: '[=[$Y] > 0]', of: '', rest: 'Low' } },
        { command: 'select_edges', values: { where: '[=[$Edge.Length] > 2]', of: '', rest: 'All' } },
        { command: 'echo', values: { value: '[Low.Count] [All.Count]' } },
      ),
    ).toEqual(['4 12']);
  });
});
