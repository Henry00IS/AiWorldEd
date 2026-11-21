import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentListing } from '@/solid_script/document/solid_script_document_listing.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

const CUBE: SolidScriptLine = { command: 'cube', values: { size: '2, 2, 2', anchor: 'Center, Center, Center' } };

/**
 * Runs script lines.
 *
 * @param lines Lines.
 * @returns Run result.
 */
function run(...lines: SolidScriptLine[]) {
  return solidScriptProgramRun(solidScriptDocumentCreate(lines));
}

describe('SolidScript Filter List', () => {
  it('keeps items that pass Where, using $Item and $Index, and writes them to Into', () => {
    const numbers = run(
      { command: 'variable', values: { name: 'Heights', value: '1, 5, 2' } },
      { command: 'filter_list', values: { list: '[Heights]', where: '[=[$Item] > 2]', into: 'Tall' } },
      { command: 'echo', values: { value: '[Tall.Count] [Tall.First] [Tall.Last]' } },
    );
    expect(numbers.error).toBeNull();
    expect(numbers.messages).toEqual(['1 5 5']);
    const nth = run(
      { command: 'filter_list', values: { list: '10, 20, 30, 40', where: '[=EveryNth([$Index], 2)]', into: 'Even' } },
      { command: 'echo', values: { value: '[Even.Count] [Even.First] [Even.Last]' } },
    );
    expect(nth.error).toBeNull();
    expect(nth.messages).toEqual(['2 10 30']);
    const all = run(
      { command: 'filter_list', values: { list: '1, 2, 3', into: 'Kept' } },
      { command: 'echo', values: { value: '[Kept.Count]' } },
    );
    expect(all.error).toBeNull();
    expect(all.messages).toEqual(['3']);
  });

  it('filters faces with the same condition helpers Select Where uses', () => {
    const top = run(
      CUBE,
      { command: 'select_objects' },
      { command: 'select_faces', values: { which: 'All' } },
      {
        command: 'filter_list',
        values: {
          list: '[$Selected.Faces]',
          where: '[=Facing([$Item.Normal], Vector(0, 1, 0))]',
          into: 'Top',
        },
      },
      { command: 'echo', values: { value: '[Top.Count] [Top.First.Center]' } },
    );
    expect(top.error).toBeNull();
    expect(top.messages).toEqual(['1 [0, 1, 0]']);
    const tagged = run(
      CUBE,
      { command: 'select_objects' },
      { command: 'select_faces', values: { which: 'All' } },
      {
        command: 'filter_list',
        values: { list: '[$Selected.Faces]', where: '[=HasTag([$Item.Tags], "Top")]', into: 'Tagged' },
      },
      { command: 'echo', values: { value: '[Tagged.Count] [Tagged.First.Center]' } },
    );
    expect(tagged.error).toBeNull();
    expect(tagged.messages).toEqual(['1 [0, 1, 0]']);
  });

  it('writes the line in plain words', () => {
    expect(
      solidScriptDocumentListing(
        solidScriptDocumentCreate([
          {
            command: 'filter_list',
            values: { list: '[Heights]', where: '[=[$Item] > 2]', into: 'Tall' },
          },
        ]),
      ),
    ).toEqual(["Filter List [Heights] Where '[=[$Item] > 2]' Into 'Tall'"]);
  });
});
