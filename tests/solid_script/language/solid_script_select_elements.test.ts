import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentListing } from '@/solid_script/document/solid_script_document_listing.js';

const line = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values });
const CUBE = line('cube', { size: '2, 2, 2', anchor: 'Center, Center, Center' });
const SELECT_BRUSHES = line('select_brushes');

/** Runs lines and returns what they printed, or the error. */
function printed(...lines: SolidScriptLine[]): string[] {
  const result = solidScriptProgramRun(solidScriptDocumentCreate(lines), {});
  return result.error ? [result.error.message] : result.messages;
}

describe('SolidScript Select Edges and Select Vertices', () => {
  it('picks edges of brushes, faces or edges into [$Selected.Edges] and Into', () => {
    expect(
      printed(CUBE, SELECT_BRUSHES, line('select_edges'), line('echo', { value: '[$Selected.Edges.Count]' })),
    ).toEqual(['12']);
    expect(
      printed(
        CUBE,
        SELECT_BRUSHES,
        line('select_brushes'),
        line('select_faces', { which: 'Up', into: 'Top' }),
        line('select_edges', { of: '[Top]', into: 'Rim' }),
        line('echo', { value: '[Rim.Count] [$Selected.Edges.Count] [Rim.First.Length]' }),
      ),
    ).toEqual(['4 4 2']);
    expect(
      printed(
        line('cube', { size: '4, 1, 1', anchor: 'Center, Center, Center' }),
        SELECT_BRUSHES,
        line('select_brushes'),
        line('select_edges', { which: 'Longest', detail: '4' }),
        line('select_brushes'),
        line('select_edges', { which: 'Where', detail: '[=[$Edge.Middle.Y] > 0]', how: 'Remove' }),
        line('echo', { value: '[$Selected.Edges.Count] [$Selected.Edges.First.Length]' }),
      ),
    ).toEqual(['2 4']);
  });

  it('picks corners into [$Selected.Vertices] and Into, and stops on what it cannot pick from', () => {
    expect(
      printed(
        CUBE,
        SELECT_BRUSHES,
        line('select_brushes'),
        line('select_vertices', { which: 'Where', detail: '[=[$Vertex.Position.Y] > 0]', into: 'Up' }),
        line('echo', { value: '[Up.Count] [$Selected.Vertices.Count] [Up.Center]' }),
      ),
    ).toEqual(['4 4 [0, 1, 0]']);
    expect(
      printed(
        CUBE,
        SELECT_BRUSHES,
        line('select_brushes'),
        line('select_edges', { which: 'Longest', detail: '1' }),
        line('select_vertices', { of: '[$Selected.Edges]' }),
        line('echo', { value: '[$Selected.Vertices.Count]' }),
      ),
    ).toEqual(['2']);
    expect(printed(line('select_edges'))[0]).toMatch(/doesn't know which brushes/);
    expect(
      printed(CUBE, SELECT_BRUSHES, line('select_vertices', { into: 'V' }), line('select_edges', { of: '[V]' }))[0],
    ).toMatch(/Of needs a Brush, Face, Edge or Text, or a list of them, not a Vertex List/);
  });

  it('writes its lines in plain words', () => {
    expect(
      solidScriptDocumentListing(
        solidScriptDocumentCreate([
          line('select_edges', { which: 'Longest', detail: '2', into: 'Long' }),
          line('select_vertices', { how: 'Add' }),
        ]),
      ),
    ).toEqual(["Select Edges Longest '2' Into [Long]", 'Select Vertices All (Add)']);
  });
});
