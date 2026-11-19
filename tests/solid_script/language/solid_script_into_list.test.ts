import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';

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

describe('SolidScript multi-item Into lists', () => {
  it('writes Linear Extrude Into as a list for one outline and for several', () => {
    expect(
      printed(
        line('linear_extrude', { height: '1', into: 'Posts' }),
        line('square', { size: '1, 1' }),
        END,
        line('echo', { value: '[=[Posts.Count]]' }),
      ),
    ).toEqual(['1']);
    expect(
      printed(
        line('linear_extrude', { height: '1', into: 'Posts' }),
        line('square', { size: '1, 1' }),
        line('transform', { move: '2, 0, 0' }),
        line('square', { size: '1, 1' }),
        END,
        END,
        line('echo', { value: '[=[Posts.Count]]' }),
      ),
    ).toEqual(['2']);
  });

  it('writes Stairs Into as a list, including a single step', () => {
    expect(
      printed(
        line('stairs', { size: '1, 1, 1', sizing: 'Step Count', count: '1', into: 'Steps' }),
        line('echo', { value: '[=[Steps.Count]]' }),
      ),
    ).toEqual(['1']);
    expect(
      printed(
        line('stairs', { size: '1, 2, 1', sizing: 'Step Count', count: '4', into: 'Steps' }),
        line('echo', { value: '[=[Steps.Count]]' }),
      ),
    ).toEqual(['4']);
  });

  it('declares Into as a Brush list on every line that can create several items', () => {
    for (const id of [
      'place_at_points',
      'place_on_face',
      'linear_extrude',
      'rotate_extrude',
      'stairs',
      'hollowBox',
      'torus',
      'pipe',
      'column',
      'arch',
      'blastHole',
      'curvedStairs',
    ]) {
      const field = solidScriptCommandFind(id)?.parameters.find((parameter) => parameter.key === 'into');
      const gives = field?.writes?.gives;
      expect({ id, kind: gives?.rule === 'kind' ? gives.kind : undefined }).toEqual({
        id,
        kind: 'Brush List',
      });
    }
    const cube = solidScriptCommandFind('cube')?.parameters.find((parameter) => parameter.key === 'into');
    const gives = cube?.writes?.gives;
    expect(gives?.rule === 'kind' ? gives.kind : undefined).toBe('Brush');
  });
});
