import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentListing } from '@/solid_script/document/solid_script_document_listing.js';

const END: SolidScriptLine = { command: 'end' };
const CUBE: SolidScriptLine = { command: 'cube', values: { size: '2, 2, 2', anchor: 'Center, Center, Center' } };

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

/**
 * Vectors Echo printed, one point per line as x,y,z numbers.
 *
 * @param messages Echo lines such as "[1, 0, 0]".
 * @returns Points.
 */
function pointsOf(messages: readonly string[]): [number, number, number][] {
  return messages.map((message) => {
    const match = message.match(/^\[(.+), (.+), (.+)\]$/);
    expect(match, message).not.toBeNull();
    const x = Number(match?.[1]);
    const y = Number(match?.[2]);
    const z = Number(match?.[3]);
    return [x, y, z];
  });
}

/**
 * Echoes each scattered point after optional setup lines.
 *
 * @param extra Scatter fields.
 * @param setup Lines to run first, such as a Cube and Select Faces.
 * @returns Points.
 */
function scatter(extra: Record<string, string>, setup: SolidScriptLine[] = []): [number, number, number][] {
  return pointsOf(
    printed(
      ...setup,
      { command: 'scatter_points', values: { into: 'Spots', ...extra } },
      { command: 'for_each', values: { variable: 'Spot', list: '[Spots]' } },
      { command: 'echo', values: { value: '[Spot]' } },
      END,
    ),
  );
}

/**
 * Echoes scattered points inside a Translate block.
 *
 * @param extra Scatter fields.
 * @param move Metres to translate by, as text.
 * @returns Points.
 */
function scatterMoved(extra: Record<string, string>, move: string): [number, number, number][] {
  return pointsOf(
    printed(
      { command: 'translate', values: { v: move } },
      { command: 'scatter_points', values: { into: 'Spots', ...extra } },
      { command: 'for_each', values: { variable: 'Spot', list: '[Spots]' } },
      { command: 'echo', values: { value: '[Spot]' } },
      END,
      END,
    ),
  );
}

describe('SolidScript Scatter Points Where', () => {
  it('keeps the Faces listing and points when Where is left at its default', () => {
    const values = { count: '4', seed: '7', into: 'Spots', normals: 'Ways' };
    const withWhere = { command: 'scatter_points', values: { where: 'Faces', ...values } };
    const without = { command: 'scatter_points', values };
    const script = (line: SolidScriptLine): SolidScriptLine[] => [
      CUBE,
      { command: 'select_brushes' },
      { command: 'select_faces', values: { which: 'Up' } },
      line,
    ];
    expect(solidScriptDocumentListing(solidScriptDocumentCreate(script(withWhere)))).toEqual(
      solidScriptDocumentListing(solidScriptDocumentCreate(script(without))),
    );
    expect(
      printed(CUBE, { command: 'select_brushes' }, { command: 'select_faces', values: { which: 'All' } }, without, {
        command: 'echo',
        values: { value: '[=[Spots.Count]]' },
      }),
    ).toEqual(['4']);
  });

  it('fills a brush or a mesh, staying inside, and keeps the same seed', () => {
    const insideBrush = scatter({ where: 'Inside', count: '40', seed: '3' }, [
      CUBE,
      { command: 'select_brushes' },
      { command: 'select_faces', values: { which: 'All' } },
    ]);
    expect(insideBrush).toHaveLength(40);
    for (const [x, y, z] of insideBrush) {
      expect(Math.abs(x)).toBeLessThanOrEqual(1.0001);
      expect(Math.abs(y)).toBeLessThanOrEqual(1.0001);
      expect(Math.abs(z)).toBeLessThanOrEqual(1.0001);
    }
    expect(
      scatter({ where: 'Inside', count: '40', seed: '3' }, [
        CUBE,
        { command: 'select_brushes' },
        { command: 'select_faces', values: { which: 'All' } },
      ]),
    ).toEqual(insideBrush);
    const insideMesh = scatter({ where: 'Inside', count: '20', seed: '3' }, [
      { command: 'mesh_brushes' },
      CUBE,
      END,
      { command: 'select_brushes' },
      { command: 'select_faces', values: { which: 'All' } },
    ]);
    expect(insideMesh).toHaveLength(20);
    for (const [x, y, z] of insideMesh) {
      expect(Math.abs(x)).toBeLessThanOrEqual(1.0001);
      expect(Math.abs(y)).toBeLessThanOrEqual(1.0001);
      expect(Math.abs(z)).toBeLessThanOrEqual(1.0001);
    }
  });

  it('fills a box of Size, follows a Translate, and lays a grid', () => {
    const box = scatter({ where: 'Box', count: '30', seed: '2', size: '2, 2, 2' });
    expect(box).toHaveLength(30);
    for (const [x, y, z] of box) {
      expect(Math.abs(x)).toBeLessThanOrEqual(1.0001);
      expect(Math.abs(y)).toBeLessThanOrEqual(1.0001);
      expect(Math.abs(z)).toBeLessThanOrEqual(1.0001);
    }
    expect(scatter({ where: 'Box', count: '30', seed: '2', size: '2, 2, 2' })).toEqual(box);
    expect(scatterMoved({ where: 'Box', count: '1', seed: '0', size: '0, 0, 0' }, '4, 1, 0')).toEqual([[4, 1, 0]]);
    expect(scatter({ where: 'Grid', counts: '2, 1, 1', size: '2, 2, 2' })).toEqual([
      [-1, 0, 0],
      [1, 0, 0],
    ]);
    expect(scatterMoved({ where: 'Grid', counts: '1, 1, 1', size: '2, 2, 2' }, '0, 3, 0')).toEqual([[0, 3, 0]]);
  });

  it('stops when Counts would make too many points', () => {
    expect(
      run({ command: 'scatter_points', values: { where: 'Grid', counts: '25, 25, 25', into: 'P' } }).error?.text,
    ).toMatch(/Line \d+: Counts needs three whole numbers from 1 to 100, and at most 10000 points in all/);
  });
});
