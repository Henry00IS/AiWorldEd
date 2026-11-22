import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Makes a Path and prints its point count, first, middle and last points.
 *
 * @param values Path fields.
 * @returns Program result.
 */
function path(values: Record<string, string>): ReturnType<typeof solidScriptProgramRun> {
  return solidScriptProgramRun(
    solidScriptDocumentCreate([
      { command: 'path', values: { into: 'P', ...values } },
      { command: 'echo', values: { value: '[P.Points.Count]' } },
      { command: 'echo', values: { value: '[P.Points(0)] [P.Points(2)] [P.Points(4)]' } },
    ]),
  );
}

describe('Path Smooth and Bezier', () => {
  it('bends a Bezier from From to To through its handles', () => {
    const result = path({
      shape: 'Bezier',
      from: '0, 0, 0',
      from_handle: '0, 4, 0',
      to_handle: '4, 4, 0',
      to: '4, 0, 0',
      count: '5',
    });
    expect(result.error?.message).toBeUndefined();
    expect(result.messages).toEqual(['5', '[0, 0, 0] [2, 3, 0] [4, 0, 0]']);
  });

  it('runs a Smooth path through every point with Sides segments per stretch', () => {
    const result = path({ shape: 'Smooth', points: '[0, 0, 0], [2, 2, 0], [4, 0, 0]', sides: '2' });
    expect(result.error?.message).toBeUndefined();
    expect(result.messages).toEqual(['5', '[0, 0, 0] [2, 2, 0] [4, 0, 0]']);
  });

  it('closes a Smooth path without repeating its first point', () => {
    const result = path({
      shape: 'Smooth',
      points: '[0, 0, 0], [2, 0, 0], [2, 0, 2], [0, 0, 2]',
      sides: '3',
      closed: 'Yes',
    });
    expect(result.error?.message).toBeUndefined();
    expect(result.messages[0]).toBe('12');
  });
});
