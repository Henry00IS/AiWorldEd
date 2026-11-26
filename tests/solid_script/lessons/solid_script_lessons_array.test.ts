import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptGeometryLeaves } from '@/solid_script/language/solid_script_geometry.js';

/**
 * Runs a picked cube and the given lines, and gives the centers of the solids
 * built, rounded.
 *
 * @param lines Lines after the cube.
 * @returns Centers, or the error.
 */
function centers(...lines: SolidScriptLine[]): number[][] | string {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([{ command: 'cube' }, { command: 'select_objects' }, ...lines]),
  );
  if (result.error) return result.error.message;
  return solidScriptGeometryLeaves(result.shapes).map((leaf) => {
    const points = leaf.kind === 'solid' ? (leaf.points ?? []) : leaf.points;
    const sum = points.reduce((acc, point) => acc.add(point.clone()), points[0]!.clone().multiplyScalar(0));
    return sum
      .divideScalar(points.length)
      .toArray()
      .map((value) => Math.round(value * 1000) / 1000 + 0);
  });
}

describe('Array', () => {
  it('makes Count objects in a Line, each Offset further', () => {
    expect(centers({ command: 'array_in_line', values: { count: '3', offset: '2, 0, 0' } })).toEqual([
      [0, 0, 0],
      [2, 0, 0],
      [4, 0, 0],
    ]);
  });

  it('spreads them around a Circle, a full turn by default', () => {
    expect(
      centers(
        { command: 'move_by', values: { by: '2, 0, 0' } },
        { command: 'array_in_circle', values: { count: '4'} },
      ),
    ).toEqual([
      [2, 0, 0],
      [0, 0, -2],
      [-2, 0, 0],
      [0, 0, 2],
    ]);
  });

  it('places them evenly along a Path, the first at its start', () => {
    expect(
      centers({ command: 'array_along_path', values: { count: '3', path: '[0, 0, 0], [4, 0, 0]' } }),
    ).toEqual([
      [0, 0, 0],
      [2, 0, 0],
      [4, 0, 0],
    ]);
  });

  it('Into keeps only the new copies, out of the world until Output', () => {
    const result = solidScriptProgramRun(
      solidScriptDocumentCreate([
        { command: 'cube' },
        { command: 'select_objects' },
        { command: 'array_in_line', values: { count: '3', into: 'Copies' } },
        { command: 'echo', values: { value: '[Copies.Count]' } },
      ]),
    );
    expect(result.error).toBeNull();
    expect(result.messages).toEqual(['2']);
    expect(solidScriptGeometryLeaves(result.shapes)).toHaveLength(1);
  });
});
