import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';

const line = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values });

/**
 * Builds two boxes, 1 by 1 by 4 long along Z, at X -3 and X 5, runs a line on
 * both and prints their centers and sizes.
 *
 * @param tool The line run on both boxes.
 * @returns Center and size of each box.
 */
function boxes(tool: SolidScriptLine): string[] {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([
      line('transform', { move: '-3, 0, 0' }),
      line('cube', { size: '1, 1, 4' }),
      line('end'),
      line('transform', { move: '5, 0, 0' }),
      line('cube', { size: '1, 1, 4' }),
      line('end'),
      line('select_objects', { into: 'Both' }),
      { ...tool, values: { ...tool.values, of: '[Both]' } },
      line('echo', { value: '[Both.First.Center]|[Both.First.Size]|[Both.Last.Center]|[Both.Last.Size]' }),
    ]),
  );
  expect(result.error?.message ?? null).toBeNull();
  return result.messages;
}

describe('Around on Rotate By and Scale By', () => {
  it('offers Around with Origin first, so old scripts turn as before', () => {
    for (const id of ['rotate_by', 'scale_by']) {
      const around = solidScriptCommandFind(id)?.parameters.find((parameter) => parameter.key === 'around');
      expect(around?.default, id).toBe('Origin');
      expect(
        around?.words?.map((word) => word.word),
        id,
      ).toEqual(['Origin', 'Combined Center', 'Each Center']);
    }
  });

  it('turns each item around its own center with Each Center', () => {
    expect(boxes(line('rotate_by', { by: '0, 90, 0', around: 'Each Center' }))).toEqual([
      '[-3, 0, 0]|[4, 1, 1]|[5, 0, 0]|[4, 1, 1]',
    ]);
  });

  it('turns the whole list around the origin, or around its combined center', () => {
    expect(boxes(line('rotate_by', { by: '0, 180, 0' }))).toEqual(['[3, 0, 0]|[1, 1, 4]|[-5, 0, 0]|[1, 1, 4]']);
    expect(boxes(line('rotate_by', { by: '0, 90, 0', around: 'Combined Center' }))).toEqual([
      '[1, 0, 4]|[4, 1, 1]|[1, 0, -4]|[4, 1, 1]',
    ]);
  });

  it('scales each item about its own center with Each Center, and the list from the origin by default', () => {
    expect(boxes(line('scale_by', { by: '2, 1, 1', around: 'Each Center' }))).toEqual([
      '[-3, 0, 0]|[2, 1, 4]|[5, 0, 0]|[2, 1, 4]',
    ]);
    expect(boxes(line('scale_by', { by: '2, 1, 1' }))).toEqual(['[-6, 0, 0]|[2, 1, 4]|[10, 0, 0]|[2, 1, 4]']);
  });
});
