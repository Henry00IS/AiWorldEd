import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Runs a cube and one find line, then echoes a text.
 *
 * @param find Find values, with `command` naming the find block.
 * @param echo Echo text.
 * @returns First message, or the error.
 */
function findOn(find: Record<string, string>, echo: string, command = 'find_closest'): string {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([
      { command: 'cube', values: { size: '2', label: 'C' } },
      { command: 'select_faces', values: { which: 'All', of: 'C' } },
      { command, values: find },
      { command: 'echo', values: { value: echo } },
    ]),
  );
  return result.error?.message ?? result.messages[0] ?? '';
}

describe('Find Closest Target, Raycast Max Distance and Sample', () => {
  it('measures to edges or corners when Target says so', () => {
    expect(findOn({ from: '0, 3, 0', target: 'Faces', into: 'P', distance: 'D' }, '[D]')).toBe('2');
    expect(findOn({ from: '3, 3, 0', target: 'Edges', into: 'P' }, '[P]')).toBe('[1, 1, 0]');
    expect(findOn({ from: '3, 3, 3', target: 'Corners', into: 'P' }, '[P]')).toBe('[1, 1, 1]');
  });

  it('misses beyond Max Distance', () => {
    expect(findOn({ from: '0, 5, 0', direction: '0, -1, 0', max_distance: '3', hit: 'H' }, '[H]', 'raycast')).toBe(
      'No',
    );
    expect(findOn({ from: '0, 5, 0', direction: '0, -1, 0', max_distance: '5', hit: 'H' }, '[H]', 'raycast')).toBe(
      'Yes',
    );
  });

  it('reads Sample on the face found, once per point for a list', () => {
    expect(findOn({ from: '0, 3, 0', sample: '[=[$Face.Normal.Y]]', sampled: 'S' }, '[S]')).toBe('1');
    expect(findOn({ from: '[0, 3, 0], [0, -3, 0]', sample: '[=[$Face.Normal.Y]]', sampled: 'S' }, '[S]')).toBe(
      '[1, -1]',
    );
  });
});
