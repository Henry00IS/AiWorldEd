import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';

const line = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values });
const END = line('end');

/**
 * Messages a successful run printed.
 *
 * @param lines Lines.
 * @returns Messages.
 */
function printed(...lines: SolidScriptLine[]): string[] {
  const result = solidScriptProgramRun(solidScriptDocumentCreate(lines), {});
  expect(result.error?.message ?? null).toBeNull();
  return result.messages;
}

/**
 * The mistake a run stopped with.
 *
 * @param lines Lines.
 * @returns Mistake text.
 */
function failed(...lines: SolidScriptLine[]): string {
  return solidScriptProgramRun(solidScriptDocumentCreate(lines), {}).error?.text ?? '';
}

describe('SolidScript Place At Points', () => {
  it('stands a brush at each point, and turns it when Directions is given', () => {
    expect(
      printed(
        line('place_at_points', { at: '[0, 2, 0], [4, 0, 0]', into: '' }),
        line('cube', { size: '1, 1, 1', into: 'A' }),
        END,
        line('echo', {
          value: '[=[$Selected.Brushes.Count]] [$Selected.Brushes.First.Center] [$Selected.Brushes.Last.Center]',
        }),
      ),
    ).toEqual(['2 [0, 2, 0] [4, 0, 0]']);
    expect(
      printed(
        line('place_at_points', { at: '0, 0, 0', directions: '0, 0, 1' }),
        line('cube', { size: '2, 4, 2', into: 'Post' }),
        END,
        line('echo', { value: '[Post.Size.z] [Post.Size.y]' }),
      ),
    ).toEqual(['4 2']);
  });

  it('follows a Translate around it, and lifts along up', () => {
    expect(
      printed(
        line('translate', { v: '0, 3, 0' }),
        line('place_at_points', { at: '1, 0, 0', lift: '2' }),
        line('cube', { size: '1, 1, 1', into: 'C' }),
        END,
        END,
        line('echo', { value: '[C.Center]' }),
      ),
    ).toEqual(['[1, 5, 0]']);
  });

  it('stops when Directions does not match the number of points', () => {
    expect(
      failed(line('place_at_points', { at: '[0, 0, 0], [1, 0, 0]', directions: '0, 1, 0' }), line('cube'), END),
    ).toMatch(/Line \d+: Directions needs one direction for each point in At.*At has 2 and Directions has 1/i);
  });
});
