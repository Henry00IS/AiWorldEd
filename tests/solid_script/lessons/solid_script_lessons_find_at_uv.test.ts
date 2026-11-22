import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/** A one-face grid with its face in [All]. */
const GRID: SolidScriptLine[] = [
  { command: 'grid_mesh', values: { size: '2, 0, 2', columns: '1', rows: '1' } },
  { command: 'select_objects' },
  { command: 'select_faces', values: { which: 'All', into: 'All' } },
];

/**
 * Runs lines after the grid and prints what Echo reads.
 *
 * @param lines Lines after the grid.
 * @param echo What to print.
 * @returns Printed text, or the error.
 */
function ran(lines: SolidScriptLine[], echo: string): string {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([...GRID, ...lines, { command: 'echo', values: { value: echo } }]),
  );
  return result.error?.message ?? result.messages[0] ?? '';
}

/**
 * Reads a printed list of vectors.
 *
 * @param text Printed list.
 * @returns Vectors.
 */
function vectors(text: string): number[][] {
  return JSON.parse(text) as number[][];
}

describe('Find On At UV', () => {
  it('finds the point whose texture coordinates are From, blended from the face corners', () => {
    const uvs = vectors(ran([], '[All(0).UVs]'));
    const corners = vectors(ran([], '[All(0).Vertices.Positions]'));
    const at = (u: number, v: number): string =>
      ran(
        [{ command: 'find_on', values: { how: 'At UV', from: `${u}, ${v}, 0`, of: '[All]', into: 'Spot' } }],
        '[Spot]',
      );
    const [u0 = 0, v0 = 0] = uvs[0] ?? [];
    const [u2 = 0, v2 = 0] = uvs[2] ?? [];
    expect(at((u0 + u2) / 2, (v0 + v2) / 2)).toBe(ran([], '[All(0).Center]'));
    const corner = vectors(`[${at(u0, v0)}]`)[0] ?? [];
    expect(corners.some((point) => point.every((value, axis) => Math.abs(value - (corner[axis] ?? NaN)) < 1e-9))).toBe(
      true,
    );
    expect(at(u0 * 0.75 + u2 * 0.25, v0 * 0.75 + v2 * 0.25)).not.toBe(at(u0, v0));
  });

  it('misses outside every face', () => {
    expect(
      ran([{ command: 'find_on', values: { how: 'At UV', from: '50, 50, 0', of: '[All]', hit: 'Hit' } }], '[Hit]'),
    ).toBe('No');
  });
});
