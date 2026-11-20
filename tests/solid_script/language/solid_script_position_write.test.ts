import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptShapeLeavesPositive } from '@/solid_script/language/solid_script_shape.js';
import { solidScriptShapeMeshes } from '@/solid_script/language/solid_script_mesh.js';
import { solidScriptBodyConvex } from '@/solid_script/language/solid_script_body.js';

const END: SolidScriptLine = { command: 'end' };
const CUBE: SolidScriptLine = { command: 'cube', values: { size: '2, 2, 2', anchor: 'Center, Center, Center' } };
const SELECT_BRUSHES: SolidScriptLine = { command: 'select_brushes' };
const SELECT_ALL_VERTICES: SolidScriptLine = { command: 'select_vertices', values: { which: 'All' } };

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
 * Rounds a point for comparison.
 *
 * @param point Corner.
 * @returns Rounded components.
 */
function xyz(point: THREE.Vector3): number[] {
  return [point.x, point.y, point.z].map((value) => Math.round(value * 1e6) / 1e6);
}

/**
 * Sorted corners of the one solid a run built, or the error.
 *
 * @param lines Lines.
 * @returns Points, or the error.
 */
function solidPoints(...lines: SolidScriptLine[]): number[][] | string {
  const result = run(...lines);
  if (result.error) return result.error.message;
  const solids = result.shapes
    .flatMap(solidScriptShapeLeavesPositive)
    .flatMap((leaf) => (leaf.kind === 'solid' ? [leaf.points] : []));
  const [points] = solids;
  if (!points || solids.length !== 1) return `expected 1 solid, got ${solids.length}`;
  return points.map(xyz).sort((left, right) => left.join().localeCompare(right.join()));
}

describe('SolidScript Set Vertex.Position', () => {
  it('moves every selected corner by a per-vertex formula', () => {
    const moved = solidPoints(CUBE, SELECT_BRUSHES, SELECT_ALL_VERTICES, {
      command: 'variable',
      values: { name: '$Selected.Vertices.Positions', value: '[=[$Vertex.Position] + [0, 1, 0]]' },
    });
    expect(moved).toEqual(
      [
        [-1, 0, -1],
        [-1, 0, 1],
        [-1, 2, -1],
        [-1, 2, 1],
        [1, 0, -1],
        [1, 0, 1],
        [1, 2, -1],
        [1, 2, 1],
      ].sort((left, right) => left.join().localeCompare(right.join())),
    );
  });

  it('reads every position in the line from the geometry as it was before the line', () => {
    const result = run({ command: 'mesh_brushes' }, CUBE, END, SELECT_BRUSHES, SELECT_ALL_VERTICES, {
      command: 'variable',
      values: { name: '$Selected.Vertices.Positions', value: '[=[$Selected.Vertices.First.Position] + [1, 0, 0]]' },
    });
    expect(result.error).toBeNull();
    const [mesh] = solidScriptShapeMeshes(result.shapes);
    const points = mesh?.points.map(xyz) ?? [];
    expect(points).toHaveLength(8);
    expect(new Set(points.map((point) => point.join(','))).size).toBe(1);
  });

  it('keeps the faces of a brush whose corners still fit them, and rebuilds them only when a face bends', () => {
    const solid = (result: ReturnType<typeof run>) => {
      expect(result.error).toBeNull();
      const [leaf] = result.shapes.flatMap(solidScriptShapeLeavesPositive);
      if (leaf?.kind !== 'solid') throw new Error('expected a solid');
      return leaf;
    };
    const cube = solid(run(CUBE));
    const write = (value: string) =>
      solid(
        run(CUBE, SELECT_BRUSHES, SELECT_ALL_VERTICES, {
          command: 'variable',
          values: { name: '$Selected.Vertices.Positions.Y', value },
        }),
      );
    const raised = write('[=[$Y] * 2 + 1]');
    expect(raised.faces).toEqual(cube.faces);
    const bent = write('[=[$Y] + ([$X] + 1) * ([$Z] + 1) / 8]');
    expect(bent.faces).toHaveLength(8);
    expect(bent.points.map(xyz)).toEqual(
      cube.points.map((point) => xyz(point.clone().setY(point.y + ((point.x + 1) * (point.z + 1)) / 8))),
    );
    expect(solidScriptBodyConvex(bent)).toBe(true);
  });

  it('stops when the corners would make a brush that is no longer a convex brush', () => {
    const result = run(CUBE, SELECT_BRUSHES, SELECT_ALL_VERTICES, {
      command: 'variable',
      values: { name: '$Selected.Vertices.Positions', value: '0, 0, 0' },
    });
    expect(result.error?.message ?? '').toMatch(/is no longer a convex brush/);
  });

  it('still refuses members that can only be read', () => {
    const result = run(
      CUBE,
      { command: 'select_brushes' },
      { command: 'select_faces', values: { which: 'All' } },
      {
        command: 'variable',
        values: { name: '$Selected.Faces.First.Center', value: '0, 0, 0' },
      },
    );
    expect(result.error?.message ?? '').toMatch(/can only be read/);
  });

  it('sets one axis from $Y and leaves the other axes, still from the snapshot', () => {
    const moved = solidPoints(CUBE, SELECT_BRUSHES, SELECT_ALL_VERTICES, {
      command: 'variable',
      values: { name: '$Selected.Vertices.Positions.Y', value: '[=[$Y] + 1]' },
    });
    expect(moved).toEqual(
      [
        [-1, 0, -1],
        [-1, 0, 1],
        [-1, 2, -1],
        [-1, 2, 1],
        [1, 0, -1],
        [1, 0, 1],
        [1, 2, -1],
        [1, 2, 1],
      ].sort((left, right) => left.join().localeCompare(right.join())),
    );
  });

  it('moves mesh corners in place, with no convex check', () => {
    const result = run({ command: 'mesh_brushes' }, CUBE, END, SELECT_BRUSHES, SELECT_ALL_VERTICES, {
      command: 'variable',
      values: { name: '$Selected.Vertices.Positions', value: '[=[$Vertex.Position] + [0, 1, 0]]' },
    });
    expect(result.error).toBeNull();
    const meshes = solidScriptShapeMeshes(result.shapes);
    const [mesh] = meshes;
    expect(meshes).toHaveLength(1);
    expect(mesh?.points.map(xyz).sort((left, right) => left.join().localeCompare(right.join()))).toEqual(
      [
        [-1, 0, -1],
        [-1, 0, 1],
        [-1, 2, -1],
        [-1, 2, 1],
        [1, 0, -1],
        [1, 0, 1],
        [1, 2, -1],
        [1, 2, 1],
      ].sort((left, right) => left.join().localeCompare(right.join())),
    );
  });
});
