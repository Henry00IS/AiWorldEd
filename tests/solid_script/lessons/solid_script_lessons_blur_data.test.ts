import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Runs a cube whose top face has Heat 6 and every other face 0, then the lines.
 *
 * @param lines Lines after the cube.
 * @returns Messages, or the error message.
 */
function heated(...lines: SolidScriptLine[]): string[] | string {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([
      { command: 'cube', values: { size: '1', into: 'Box' } },
      { command: 'variable', values: { name: 'Box.Faces.Data.Heat', value: '[=[$Item.Normal].Y > 0.5 ? 6 : 0]' } },
      { command: 'select_faces', values: { which: 'All', of: '[Box]', into: 'All' } },
      ...lines,
    ]),
  );
  return result.error ? result.error.message : result.messages;
}

describe('Blur Data', () => {
  it('averages each face with the faces sharing its edges, reading the round before', () => {
    expect(
      heated(
        { command: 'blur_data', values: { key: 'Heat', rounds: '1', of: '[All]' } },
        { command: 'select_faces', values: { which: 'Facing Up', of: '[Box]', into: 'Hot' } },
        { command: 'select_faces', values: { which: 'Facing Down', of: '[Box]', into: 'Cold' } },
        { command: 'select_faces', values: { which: 'Facing Left', of: '[Box]', into: 'Side' } },
        { command: 'echo', values: { value: '[Hot(0).Data.Heat] [Side(0).Data.Heat] [Cold(0).Data.Heat]' } },
      ),
    ).toEqual(['1.2 1.2 0']);
  });

  it('averages corners with the corners sharing an edge', () => {
    expect(
      heated(
        { command: 'variable', values: { name: 'Box.Vertices.Data.Up', value: '[=[$Item.Position].Y > 0 ? 1 : 0]' } },
        { command: 'blur_data', values: { key: 'Up', rounds: '1', of: '[Box.Vertices]' } },
        {
          command: 'select_vertices',
          values: { which: 'All', of: '[Box]', where: '[=[$Vertex.Position.Y] > 0]', into: 'Top' },
        },
        { command: 'echo', values: { value: '[Top(0).Data.Up]' } },
      ),
    ).toEqual(['0.75']);
  });

  it('leaves values alone with 0 rounds and stops on Rounds that are not whole', () => {
    expect(heated({ command: 'blur_data', values: { key: 'Heat', rounds: '0', of: '[All]' } })).toEqual([]);
    expect(heated({ command: 'blur_data', values: { key: 'Heat', rounds: '1.5', of: '[All]' } })).toMatch(
      /whole number/,
    );
  });
});
