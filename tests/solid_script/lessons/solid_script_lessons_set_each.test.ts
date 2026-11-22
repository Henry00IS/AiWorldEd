import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptParameterEachKind } from '@/solid_script/commands/solid_script_command_each.js';
import { solidScriptCommands } from '@/solid_script/commands/solid_script_command_catalog.js';

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

describe('Set a Data value through a list, per item', () => {
  it('works Value out once per item with [$Item] and [$Index]', () => {
    expect(
      printed(
        CUBE,
        { command: 'variable', values: { name: 'Box.Faces.Data.Number', value: '[=[$Index] * 10]' } },
        { command: 'echo', values: { value: '[Box.Faces(0).Data.Number]' } },
        { command: 'echo', values: { value: '[Box.Faces(5).Data.Number]' } },
        { command: 'variable', values: { name: 'Box.Faces.Data.Up', value: '[=[$Item.Normal].Y > 0.5]' } },
        { command: 'for_each', values: { variable: 'Face', list: '[Box.Faces]' } },
        { command: 'echo', values: { value: '[Face.Data.Up]' } },
        { command: 'end' },
      ),
    ).toEqual(['0', '50', 'No', 'Yes', 'No', 'No', 'No', 'No']);
  });

  it('still writes one value to every item when Value reads no item', () => {
    expect(
      printed(
        CUBE,
        { command: 'variable', values: { name: 'Box.Faces.Data.Kind', value: 'trim' } },
        { command: 'echo', values: { value: '[Box.Faces(3).Data.Kind]' } },
      ),
    ).toEqual(['trim']);
  });

  it('offers the per-item values in Value for a Data write', () => {
    const set = solidScriptCommands.find((command) => command.id === 'variable');
    const value = set?.parameters.find((parameter) => parameter.key === 'value');
    if (!value) throw new Error('Set has no Value');
    expect(solidScriptParameterEachKind(value, { name: 'Box.Faces.Data.Number' })).toBe('Item');
    expect(solidScriptParameterEachKind(value, { name: 'Width' })).toBeUndefined();
  });
});
