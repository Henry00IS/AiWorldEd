import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/** A 2 m mesh cube, picked whole. */
const MESH_CUBE: SolidScriptLine[] = [
  { command: 'mesh_from_solids' },
  { command: 'cube', values: { size: '2, 2, 2', anchor: 'Center, Center, Center' } },
  { command: 'end' },
  { command: 'select_objects' },
];

/**
 * Runs lines after a mesh cube and prints the first message, or the error.
 *
 * @param lines Lines after the cube.
 * @returns Printed text or error.
 */
function ran(...lines: SolidScriptLine[]): string {
  const result = solidScriptProgramRun(solidScriptDocumentCreate([...MESH_CUBE, ...lines]));
  return result.error?.message ?? result.messages[0] ?? '';
}

describe('Duplicate Faces', () => {
  it('copies every picked face Count times into loose one-face meshes numbered from 0', () => {
    const copy: SolidScriptLine = {
      command: 'duplicate_faces',
      values: { count: '3', where: '[=[$NY] > 0.9]', into: 'Tiles' },
    };
    expect(ran(copy, { command: 'echo', values: { value: '[Tiles.Count]' } })).toBe('3');
    expect(ran(copy, { command: 'echo', values: { value: '[Tiles(2).Data.Copy]' } })).toBe('2');
    expect(ran(copy, { command: 'echo', values: { value: '[Tiles(0).Faces.Count]' } })).toBe('1');
    expect(ran(copy, { command: 'echo', values: { value: '[Tiles(0).Faces(0).Normal]' } })).toBe('[0, 1, 0]');
  });

  it('lets Count change per face, and 0 copies none', () => {
    const copy: SolidScriptLine = {
      command: 'duplicate_faces',
      values: { count: '[=Round(Max([$NY], 0)) * 2]', into: 'Tiles' },
    };
    expect(ran(copy, { command: 'echo', values: { value: '[Tiles.Count]' } })).toBe('2');
  });

  it('stops on solids and on a Count that is not whole', () => {
    const solid = solidScriptProgramRun(
      solidScriptDocumentCreate([
        { command: 'cube' },
        { command: 'select_objects' },
        { command: 'duplicate_faces', values: { into: 'Tiles' } },
      ]),
    );
    expect(solid.error?.message).toContain('Mesh From Solids');
    expect(ran({ command: 'duplicate_faces', values: { count: '1.5', into: 'Tiles' } })).toContain(
      'whole number of copies',
    );
  });
});
