import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Runs a cube whose faces hold Heat 6 on top and 0 elsewhere, then the lines.
 *
 * @param lines Lines after the cube.
 * @returns Messages, or the error message.
 */
function heated(...lines: SolidScriptLine[]): string[] | string {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([
      { command: 'cube', values: { size: '1', into: 'Box' } },
      { command: 'variable', values: { name: 'Box.Faces.Data.Heat', value: '[=[$Item.Normal].Y > 0.5 ? 6 : 0]' } },
      { command: 'select_faces', values: { which: 'Facing Up', of: '[Box]', into: 'Top' } },
      ...lines,
    ]),
  );
  return result.error ? result.error.message : result.messages;
}

describe('Rename Data', () => {
  it('moves the value under Key to To on each item and leaves Key empty', () => {
    expect(
      heated(
        { command: 'rename_data', values: { key: 'Heat', to: 'Warmth', of: '[Box.Faces]' } },
        { command: 'echo', values: { value: '[Top(0).Data.Warmth] "[Top(0).Data.Heat]"' } },
      ),
    ).toEqual(['6 ""']);
  });

  it('only renames on items that pass Where', () => {
    expect(
      heated(
        {
          command: 'rename_data',
          values: { key: 'Heat', to: 'Warmth', of: '[Box.Faces]', where: '[=[$Item.Normal].Y < 0.5]' },
        },
        { command: 'echo', values: { value: '[Top(0).Data.Heat] "[Top(0).Data.Warmth]"' } },
      ),
    ).toEqual(['6 ""']);
  });

  it('stops without a Key or To', () => {
    expect(heated({ command: 'rename_data', values: { key: '[=Str()]', to: 'B', of: '[Box.Faces]' } })).toMatch(
      /needs a Key/,
    );
    expect(heated({ command: 'rename_data', values: { key: 'Heat', to: '[=Str()]', of: '[Box.Faces]' } })).toMatch(
      /needs a To/,
    );
  });
});

describe('Remove Data', () => {
  it('empties Key on each item', () => {
    expect(
      heated(
        { command: 'remove_data', values: { key: 'Heat', of: '[Box.Faces]' } },
        { command: 'echo', values: { value: '"[Top(0).Data.Heat]"' } },
      ),
    ).toEqual(['""']);
  });
});
