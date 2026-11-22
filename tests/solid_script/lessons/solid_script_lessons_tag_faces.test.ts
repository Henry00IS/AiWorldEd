import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/** Counts the faces of C tagged Roof into a variable. */
const COUNT_ROOF = (into: string): SolidScriptLine => ({
  command: 'select_faces',
  values: { which: 'All', of: 'C', where: '[=HasTag([$Face.Tags], "Roof")]', into },
});

/**
 * Runs a labelled object C built by the first lines, then the rest.
 *
 * @param lines Lines.
 * @returns Messages, or the error.
 */
function printed(...lines: SolidScriptLine[]): string[] | string {
  const result = solidScriptProgramRun(solidScriptDocumentCreate(lines));
  return result.error ? result.error.message : result.messages;
}

describe('Tag Faces', () => {
  it('tags faces so later lines find them, and takes the tag off with Remove', () => {
    expect(
      printed(
        { command: 'cube', values: { size: '1', label: 'C' } },
        { command: 'select_faces', values: { which: 'Facing Up', of: 'C' } },
        { command: 'tag_faces', values: { tag: 'Roof' } },
        { command: 'move_by', values: { by: '2, 0, 0', of: 'C' } },
        COUNT_ROOF('R'),
        { command: 'tag_faces', values: { tag: 'Roof', remove: 'Yes', of: '[R]' } },
        COUNT_ROOF('Left'),
        { command: 'echo', values: { value: '[R.Count] [R(0).Normal.Y] [Left.Count]' } },
      ),
    ).toEqual(['1 1 0']);
  });

  it('tags mesh faces, with a Tag per face', () => {
    expect(
      printed(
        { command: 'mesh_from_solids', values: { label: 'C' } },
        { command: 'cube', values: { size: '1' } },
        { command: 'end' },
        { command: 'tag_faces', values: { tag: '[=[$Face.Normal.Y] > 0.5 ? "Roof" : "Wall"]', of: 'C' } },
        COUNT_ROOF('R'),
        { command: 'echo', values: { value: '[R.Count]' } },
      ),
    ).toEqual(['1']);
  });
});
