import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';

const CUBE: SolidScriptLine = {
  command: 'cube',
  values: { size: '2, 2, 2', anchor: 'Center, Center, Center', into: 'Box' },
};

/**
 * Runs lines and returns what Echo printed, or the error.
 *
 * @param lines Lines.
 * @returns Messages, or the error message.
 */
function printed(...lines: SolidScriptLine[]): string[] | string {
  const result = solidScriptProgramRun(solidScriptDocumentCreate(lines));
  return result.error ? result.error.message : result.messages;
}

describe('Stable item Ids', () => {
  it('gives each face, edge and corner a whole-number Id that differs between them', () => {
    const shown = printed(
      CUBE,
      { command: 'echo', values: { value: '[=Len(Unique([Box.Faces.Ids]))]' } },
      { command: 'echo', values: { value: '[=Len(Unique([Box.Edges.Ids]))]' } },
      { command: 'echo', values: { value: '[=Len(Unique([Box.Vertices.Ids]))]' } },
      { command: 'echo', values: { value: '[=Round([Box.Faces(0).Id]) == [Box.Faces(0).Id]]' } },
    );
    expect(shown).toEqual(['6', '12', '8', 'Yes']);
  });

  it('keeps the Id of a face when the list around it changes', () => {
    expect(
      printed(
        CUBE,
        { command: 'variable', values: { name: 'Last', value: '[=Slice([Box.Faces], 5)]' } },
        { command: 'echo', values: { value: '[=[Last(0).Id] == [Box.Faces(5).Id]]' } },
      ),
    ).toEqual(['Yes']);
  });

  it('defaults Random to the Id, so a value stays with its face', () => {
    expect(
      printed(
        CUBE,
        { command: 'variable', values: { name: 'Box.Faces.Data.A', value: '[=Random(0, 1)]' } },
        { command: 'variable', values: { name: 'Box.Faces.Data.B', value: '[=Random(0, 1, [$Item.Id])]' } },
        { command: 'variable', values: { name: 'Last', value: '[=Slice([Box.Faces], 5)]' } },
        { command: 'variable', values: { name: 'Last.Data.C', value: '[=Random(0, 1)]' } },
        { command: 'echo', values: { value: '[=[Box.Faces(5).Data.A] == [Box.Faces(5).Data.B]]' } },
        { command: 'echo', values: { value: '[=[Box.Faces(5).Data.A] == [Box.Faces(5).Data.C]]' } },
      ),
    ).toEqual(['Yes', 'Yes']);
  });

  it('falls back to the item number for plain values', () => {
    expect(
      printed(
        { command: 'filter_list', values: { list: '5, 6, 7, 8', where: '[=[$Id] == 2]', into: 'Kept' } },
        { command: 'echo', values: { value: '[Kept(0)]' } },
      ),
    ).toEqual(['7']);
  });
});
