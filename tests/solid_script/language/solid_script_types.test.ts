import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentNames } from '@/solid_script/document/solid_script_document_names.js';
import { solidScriptDocumentListing } from '@/solid_script/document/solid_script_document_listing.js';
import { solidScriptTypeCheck } from '@/solid_script/language/solid_script_use_check.js';
import { solidScriptSuggestionContext, solidScriptSuggestions } from '@/solid_script/ui/solid_script_suggestions.js';

const line = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values });
const set = (name: string, value: string, type = ''): SolidScriptLine =>
  line('variable', type === '' ? { name, value } : { name, value, type });
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

describe('SolidScript types', () => {
  it('lets a variable without a Type hold anything, and keeps a declared Type', () => {
    expect(outcome(set('X', '2'), set('X', 'oak'), line('echo', { value: '[X]' }))).toEqual(['oak']);
    expect(outcome(set('X', '2', 'Number'), set('X', '3'), line('echo', { value: '[X]' }))).toEqual(['3']);
    expect(outcome(set('X', '2', 'Number'), set('X', 'oak'))[0]).toMatch(
      /\[X\] is declared Number, so it cannot hold Text "oak"/,
    );
    expect(outcome(set('P', '1, 2, 3', 'Vector'), line('echo', { value: '[P.y]' }))).toEqual(['2']);
    expect(outcome(set('T', 'Yes', 'Text'), set('N', '1', 'Yes/No'))[0]).toMatch(/\[N\] is declared Yes\/No/);
  });

  it('checks brushes, faces and lists against their Type when the line runs', () => {
    const top = line('select_faces', { which: 'Facing Up' });
    expect(
      outcome(CUBE, top, set('F', '[$Selected.Faces]', 'Face List'), line('echo', { value: '[F.Count]' })),
    ).toEqual(['1']);
    expect(
      outcome(CUBE, top, set('F', '[$Selected.Faces.First]', 'Face'), line('echo', { value: '[F.Area]' })),
    ).toEqual(['4']);
    expect(outcome(CUBE, top, set('F', '[$Selected.Faces]', 'Face'))[0]).toMatch(
      /\[F\] is declared Face, so it cannot hold a Face List/,
    );
    expect(outcome(CUBE, set('B', '[$Selected.Faces]', 'Brush List'))).toEqual([]);
    expect(outcome(set('L', '1, 2, 3, 4', 'Number List'), line('echo', { value: '[L.Count]' }))).toEqual(['4']);
  });

  it('writes the Type in the line and squiggles a mismatch that is certain', () => {
    expect(solidScriptDocumentListing(solidScriptDocumentCreate([set('X', '2', 'Number')]))).toEqual([
      "Set [X] as Number: '2'",
    ]);
    expect(
      solidScriptTypeCheck(
        solidScriptDocumentCreate([
          set('X', 'oak', 'Number'),
          set('Y', '2', 'Text'),
          set('Y', '[Z]'),
          set('Y', 'pine'),
          set('Z', 'tall', 'Any'),
        ]),
      ),
    ).toEqual([{ line: 1, text: '[X] is declared Number, so it cannot hold Text "oak".' }]);
    expect(solidScriptTypeCheck(solidScriptDocumentCreate([set('X', '2', 'Number'), set('X', 'oak')]))).toEqual([
      { line: 2, text: '[X] is declared Number, so it cannot hold Text "oak".' },
    ]);
    expect(solidScriptTypeCheck(solidScriptDocumentCreate([set('X', '2', 'Colour')]))).toEqual([
      { line: 1, text: expect.stringContaining('Type must be one of') },
    ]);
  });

  it('suggests the members of a declared or likely type', () => {
    expect(members([set('P', '', 'Face')], '[P.')).toContain('P.Normal');
    expect(members([CUBE, line('select_faces', { into: 'Picked' })], '[Picked.First.')).toContain(
      'Picked.First.Normal',
    );
    expect(members([set('Top', '[$Selected.Faces]')], '[Top.')).toContain('Top.Normal');
    expect(members([line('for_each', { variable: 'E', list: '[$Selected.Edges]' })], '[E.')).toContain('E.Length');
    expect(members([line('cube', { into: 'Box' })], '[Box.')).toContain('Box.Faces');
    expect(members([line('extrude_face', { top: 'Roof' })], '[Roof.First.')).toContain('Roof.First.Area');
  });
});
