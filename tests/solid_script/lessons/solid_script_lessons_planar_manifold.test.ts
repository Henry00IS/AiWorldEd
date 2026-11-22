import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/** A 2 m cube baked into a mesh, held in [Box]. */
const CUBE: SolidScriptLine[] = [
  { command: 'mesh_from_solids', values: {} },
  { command: 'cube', values: { size: '2' } },
  { command: 'end', values: {} },
  { command: 'select_objects', values: { into: 'Box' } },
];

/** Lifts the top corner at +X, +Z of [Box] by 0.2 m, bending the top face. */
const LIFT: SolidScriptLine = {
  command: 'set_positions',
  values: {
    of: '[Box]',
    to: '[=[$Vertex.Position] + Vector(0, 0.2, 0)]',
    where: '[=[$X] > 0.5 && [$Y] > 0.5 && [$Z] > 0.5]',
  },
};

/**
 * Prints one value after the cube and the given lines.
 *
 * @param value Value to print.
 * @param lines Lines to run first.
 * @returns Printed value, or the error.
 */
function read(value: string, ...lines: SolidScriptLine[]): string {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([...CUBE, ...lines, { command: 'echo', values: { value } }]),
  );
  return result.error ? result.error.message : result.messages.join('\n');
}

/**
 * Counts how often a word appears in a printed list.
 *
 * @param printed Printed list, such as [Yes, No].
 * @param word Word to count.
 * @returns How many items are that word.
 */
function count(printed: string, word: string): number {
  return printed
    .replace(/[[\]]/g, '')
    .split(', ')
    .filter((item) => item === word).length;
}

describe('Face.IsPlanar and Face.Warp', () => {
  it('finds every face of a cube flat', () => {
    expect(read('[Box.Faces.IsPlanar]')).toBe('[Yes, Yes, Yes, Yes, Yes, Yes]');
    expect(count(read('[Box.Faces.Warps]'), '0')).toBe(6);
  });

  it('finds the one face a lifted corner bends, and how far it bends', () => {
    expect(count(read('[Box.Faces.IsPlanar]', LIFT), 'No')).toBe(1);
    const warps = (JSON.parse(read('[Box.Faces.Warps]', LIFT)) as number[]).filter((warp) => warp > 0);
    expect(warps).toHaveLength(1);
    expect(warps[0]).toBeGreaterThan(0.05);
    expect(warps[0]).toBeLessThanOrEqual(0.2);
  });
});

describe('Edge.IsManifold', () => {
  it('is Yes for every edge of a closed mesh', () => {
    expect(count(read('[Box.Edges.IsManifold]'), 'Yes')).toBe(12);
  });

  it('is No for the open border of a mesh with a face deleted', () => {
    const open: SolidScriptLine[] = [
      { command: 'select_faces', values: { which: 'Facing Up', of: '[Box]' } },
      { command: 'delete_faces', values: {} },
    ];
    expect(count(read('[Box.Edges.IsManifold]', ...open), 'No')).toBe(4);
  });
});
