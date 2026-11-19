import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentNames } from '@/solid_script/document/solid_script_document_names.js';
import { solidScriptDocumentListing } from '@/solid_script/document/solid_script_document_listing.js';
import { solidScriptSuggestionContext, solidScriptSuggestions } from '@/solid_script/ui/solid_script_suggestions.js';

const line = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values });
const set = (name: string, value: string): SolidScriptLine => line('variable', { name, value });
const CUBE = line('cube', { size: '2, 2, 2' });

/** What a run printed, or the error it stopped with. */
function outcome(...lines: SolidScriptLine[]): string[] {
  // A cube at the end, as a script must build something.
  const result = solidScriptProgramRun(solidScriptDocumentCreate([...lines, CUBE]), {});
  return result.error ? [result.error.message] : result.messages;
}

/** Labels suggested at the end of a field text, in a script. */
function members(lines: SolidScriptLine[], text: string): string[] {
  const scope = { names: solidScriptDocumentNames(solidScriptDocumentCreate(lines)), extra: [], words: [] };
  return solidScriptSuggestions(solidScriptSuggestionContext(text, text.length, false), scope).map(
    (entry) => entry.label,
  );
}

describe('SolidScript Set', () => {
  it('lets a variable hold any kind, and another kind later', () => {
    expect(outcome(set('X', '2'), set('X', 'oak'), line('echo', { value: '[X]' }))).toEqual(['oak']);
    const top = line('select_faces', { which: 'Facing Up' });
    expect(
      outcome(CUBE, line('select_brushes'), top, set('F', '[$Selected.Faces]'), line('echo', { value: '[F.Count]' })),
    ).toEqual(['1']);
    expect(
      outcome(
        CUBE,
        line('select_brushes'),
        top,
        set('F', '[$Selected.Faces.First]'),
        line('echo', { value: '[F.Area]' }),
      ),
    ).toEqual(['4']);
  });

  it('writes the variable and the value in the line, and ignores a saved Type', () => {
    expect(solidScriptDocumentListing(solidScriptDocumentCreate([set('X', '2')]))).toEqual(["Set [X]: '2'"]);
    const saved = line('variable', { name: 'X', value: 'oak', type: 'Number' });
    expect(outcome(saved, line('echo', { value: '[X]' }))).toEqual(['oak']);
  });

  it('suggests the members of the kind a variable holds', () => {
    expect(
      members([CUBE, line('select_brushes'), line('select_faces', { into: 'Picked' })], '[Picked.First.'),
    ).toContain('Picked.First.Normal');
    expect(members([set('Top', '[$Selected.Faces]')], '[Top.')).toContain('Top.Normals');
    expect(members([line('for_each', { variable: 'E', list: '[$Selected.Edges]' })], '[E.')).toContain('E.Length');
    expect(members([line('cube', { into: 'Box' })], '[Box.')).toContain('Box.Faces');
    expect(members([line('extrude_face', { top: 'Roof' })], '[Roof.First.')).toContain('Roof.First.Area');
  });
});

describe('SolidScript Set reads typed commas as a list', () => {
  it('makes a list of mixed items, each read the way a list item is', () => {
    expect(
      outcome(
        set('Mixed', '[5,3,4],zu,45,[4,5,6]'),
        line('echo', { value: '[Mixed.Count]|[Mixed(0).y]|[Mixed(1)]|[=[Mixed(2)] + 1]|[Mixed(3).z]' }),
      ),
    ).toEqual(['4|3|zu|46|6']);
  });

  it('keeps a comma written $, inside one text', () => {
    expect(outcome(set('Greeting', 'Hello$, World'), line('echo', { value: '[Greeting]|[Greeting.Length]' }))).toEqual([
      'Hello, World|12',
    ]);
    expect(
      outcome(
        set('Name', 'Ann'),
        set('Greeting', 'Hello, [Name]'),
        line('echo', { value: '[Greeting.Count]|[Greeting(1)]' }),
      ),
    ).toEqual(['2|Ann']);
  });

  it('never splits a value read from a variable again', () => {
    expect(
      outcome(
        set('Greeting', 'Hello$, World'),
        set('Copy', '[Greeting]'),
        line('echo', { value: '[Copy]|[Copy.Length]' }),
      ),
    ).toEqual(['Hello, World|12']);
  });

  it('still reads three numbers as a vector and one item as one value', () => {
    expect(outcome(set('Pos', '2,3,4'), line('echo', { value: '[Pos.y]|[Pos.Length]' }))).toEqual([
      `3|${Math.round(Math.hypot(2, 3, 4) * 1e9) / 1e9}`,
    ]);
    expect(outcome(set('Pos', '[2,3,4]'), line('echo', { value: '[Pos.z]' }))).toEqual(['4']);
    expect(outcome(set('Word', 'zu'), line('echo', { value: '[Word.Length]' }))).toEqual(['2']);
  });
});
