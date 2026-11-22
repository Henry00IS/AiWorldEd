import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';

const END: SolidScriptLine = { command: 'end' };
const CUBE: SolidScriptLine = { command: 'cube', values: { size: '2, 2, 2', anchor: 'Center, Center, Center' } };

/**
 * Runs lines and returns what Echo printed, failing on an error.
 *
 * @param lines Lines.
 * @returns Messages.
 */
function printed(...lines: SolidScriptLine[]): string[] {
  const result = solidScriptProgramRun(solidScriptDocumentCreate(lines));
  expect(result.error?.message ?? null).toBeNull();
  return result.messages;
}

/**
 * Lines that clip the selected objects and count the faces tagged Cut.
 *
 * @param setup Lines that build the objects.
 * @returns Messages: faces in all, cut faces, and cut faces facing down.
 */
function cutFaces(...setup: SolidScriptLine[]): string[] {
  return printed(
    ...setup,
    { command: 'select_objects' },
    { command: 'clip', values: { normal: '0, -1, 0' } },
    { command: 'select_faces', values: { which: 'All' } },
    { command: 'echo', values: { value: '[=Len([$Selected.Faces])]' } },
    { command: 'select_faces', values: { which: 'All', where: '[=HasTag([$Face.Tags], "Cut")]' } },
    { command: 'echo', values: { value: '[=Len([$Selected.Faces])]' } },
    { command: 'select_faces', values: { which: 'Facing Down', where: '[=HasTag([$Face.Tags], "Cut")]' } },
    { command: 'echo', values: { value: '[=Len([$Selected.Faces])]' } },
  );
}

describe('Clip says which faces it made', () => {
  it('tags the cap of a cut solid Cut, so Where can pick or skip it', () => {
    expect(cutFaces(CUBE)).toEqual(['6', '1', '1']);
  });

  it('tags the caps of a cut mesh Cut', () => {
    const messages = cutFaces({ command: 'mesh_from_solids' }, CUBE, END);
    expect(messages[1]).toBe('1');
    expect(messages[2]).toBe('1');
  });

  it('tags no face when the plane misses the object', () => {
    const messages = printed(
      CUBE,
      { command: 'select_objects' },
      { command: 'clip', values: { through: '0, -5, 0', normal: '0, -1, 0' } },
      { command: 'select_faces', values: { which: 'All', where: '[=HasTag([$Face.Tags], "Cut")]' } },
      { command: 'echo', values: { value: '[=Len([$Selected.Faces])]' } },
    );
    expect(messages).toEqual(['0']);
  });
});
