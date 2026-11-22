import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import type { SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Runs lines after a cube C of size 2.
 *
 * @param lines Lines.
 * @returns Messages, or the error.
 */
function run(lines: SolidScriptLine[]): readonly string[] {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([{ command: 'cube', values: { size: '2', label: 'C' } }, ...lines]),
  );
  return result.error ? [result.error.message] : result.messages;
}

describe('Path From Edges and Path From Faces', () => {
  it('joins the edges round a face into one closed path', () => {
    expect(
      run([
        { command: 'select_faces', values: { which: 'Facing Up', of: 'C' } },
        { command: 'path_from_edges', values: { into: 'R' } },
        { command: 'echo', values: { value: '[R.Count] [R(0).Points.Count] [R(0).Closed]' } },
      ]),
    ).toEqual(['1 4 Yes']);
  });

  it('stops a path where three edges meet', () => {
    expect(
      run([
        { command: 'path_from_edges', values: { of: 'C', into: 'R' } },
        { command: 'echo', values: { value: '[R.Count] [R(0).Points.Count]' } },
      ]),
    ).toEqual(['12 2']);
  });

  it('gives each face outline as a closed path', () => {
    expect(
      run([
        { command: 'path_from_faces', values: { of: 'C', where: '[=[$Face.Normal.Y] < 0.5]', into: 'O' } },
        { command: 'echo', values: { value: '[O.Count] [O(0).Points.Count] [O(0).Closed]' } },
      ]),
    ).toEqual(['5 4 Yes']);
  });
});
