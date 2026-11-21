import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';

const END: SolidScriptLine = { command: 'end' };
const CUBE: SolidScriptLine = { command: 'cube', values: { size: '2, 2, 2', anchor: 'Center, Center, Center' } };
const SELECT_BRUSHES: SolidScriptLine = { command: 'select_objects' };
const SELECT_ALL: SolidScriptLine = { command: 'select_faces', values: { which: 'All' } };

/**
 * Runs script lines.
 *
 * @param lines Lines.
 * @returns Run result.
 */
function run(...lines: SolidScriptLine[]) {
  return solidScriptProgramRun(solidScriptDocumentCreate(lines));
}

/**
 * Messages of a successful run.
 *
 * @param lines Lines.
 * @returns Messages.
 */
function printed(...lines: SolidScriptLine[]): string[] {
  const result = run(...lines);
  expect(result.error?.message ?? null).toBeNull();
  return result.messages;
}

describe('SolidScript Find On', () => {
  it('finds the closest point on a brush or a mesh, and the first hit along a ray', () => {
    const fields = {
      from: '0, 3, 0',
      into: 'Spot',
      distance: 'Dist',
      normal: 'Way',
      hit: 'Found',
    };
    expect(
      printed(
        CUBE,
        SELECT_BRUSHES,
        SELECT_ALL,
        { command: 'find_on', values: fields },
        { command: 'echo', values: { value: '[Found] [Spot] [Dist] [Way]' } },
      ),
    ).toEqual(['Yes [0, 1, 0] 2 [0, 1, 0]']);
    expect(
      printed(
        { command: 'mesh_from_solids' },
        CUBE,
        END,
        SELECT_BRUSHES,
        SELECT_ALL,
        { command: 'find_on', values: fields },
        { command: 'echo', values: { value: '[Found] [Spot] [Dist]' } },
      ),
    ).toEqual(['Yes [0, 1, 0] 2']);
    expect(
      printed(
        CUBE,
        SELECT_BRUSHES,
        SELECT_ALL,
        {
          command: 'find_on',
          values: { how: 'Along Ray', from: '0, 0, 0', direction: '0, 1, 0', into: 'Spot', hit: 'Found' },
        },
        { command: 'echo', values: { value: '[Found] [Spot]' } },
      ),
    ).toEqual(['Yes [0, 1, 0]']);
  });

  it('writes No when a ray misses, and stops when Direction is zero', () => {
    expect(
      printed(
        CUBE,
        SELECT_BRUSHES,
        SELECT_ALL,
        { command: 'find_on', values: { how: 'Along Ray', from: '0, 3, 0', direction: '0, 1, 0', hit: 'Found' } },
        { command: 'echo', values: { value: '[Found]' } },
      ),
    ).toEqual(['No']);
    expect(
      run(CUBE, SELECT_BRUSHES, SELECT_ALL, {
        command: 'find_on',
        values: { how: 'Along Ray', from: '0, 0, 0', direction: '0, 0, 0' },
      }).error?.text,
    ).toMatch(/Line \d+: Direction needs a direction that is not 0, 0, 0/);
  });
});
