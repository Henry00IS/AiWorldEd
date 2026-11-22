import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Runs lines and echoes three variables, or gives the mistake.
 *
 * @param lines Lines.
 * @returns Echoed texts.
 */
function ran(...lines: SolidScriptLine[]): string[] {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([
      ...lines,
      { command: 'echo', values: { value: '[P]' } },
      { command: 'echo', values: { value: '[D]' } },
      { command: 'echo', values: { value: '[A]' } },
    ]),
  );
  return result.error ? [result.error.message] : result.messages;
}

const LINE = { path: '[0, 0, 0], [4, 0, 0]', into: 'P', directions: 'D', amounts: 'A' };

describe('Points From Path', () => {
  it('puts Count points evenly along an open path, with directions and amounts', () => {
    expect(ran({ command: 'points_from_path', values: { ...LINE, count: '3' } })).toEqual([
      '[[0, 0, 0], [2, 0, 0], [4, 0, 0]]',
      '[[1, 0, 0], [1, 0, 0], [1, 0, 0]]',
      '[0, 0.5, 1]',
    ]);
  });

  it('puts a point every Spacing metres and keeps the end', () => {
    const [points] = ran({ command: 'points_from_path', values: { ...LINE, by: 'Spacing', spacing: '1.5' } });
    expect(points).toBe('[[0, 0, 0], [1.5, 0, 0], [3, 0, 0], [4, 0, 0]]');
  });

  it('does not repeat the start of a closed path', () => {
    const [points] = ran(
      {
        command: 'path',
        values: {
          shape: 'From Points',
          points: '[0, 0, 0], [2, 0, 0], [2, 0, 2], [0, 0, 2]',
          closed: 'Yes',
          into: 'Loop',
        },
      },
      { command: 'points_from_path', values: { ...LINE, path: '[Loop]', count: '4' } },
    );
    expect(points).toBe('[[0, 0, 0], [2, 0, 0], [2, 0, 2], [0, 0, 2]]');
  });

  it('raises a Count of 0 or 1 to 2 so both ends of the path get a point', () => {
    for (const count of ['0', '1'])
      expect(ran({ command: 'points_from_path', values: { ...LINE, count } })[0]).toBe('[[0, 0, 0], [4, 0, 0]]');
    expect(ran({ command: 'points_from_path', values: { ...LINE, count: '-1' } })[0]).toMatch(/Count needs/);
  });

  it('stops on a bad Spacing', () => {
    expect(ran({ command: 'points_from_path', values: { ...LINE, by: 'Spacing', spacing: '0' } })[0]).toMatch(
      /Spacing needs/,
    );
  });
});
