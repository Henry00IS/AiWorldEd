import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptGeometryLeaves } from '@/solid_script/language/solid_script_geometry.js';

/** A flat grid of two faces and six corners. */
const GRID: SolidScriptLine = { command: 'grid_mesh', values: { size: '2, 0, 2', columns: '2', rows: '1' } };

/**
 * Runs lines and gives the first mesh they make.
 *
 * @param lines Lines.
 * @returns Mesh.
 */
function meshOf(...lines: SolidScriptLine[]) {
  const result = solidScriptProgramRun(solidScriptDocumentCreate(lines));
  if (result.error) throw new Error(result.error.message);
  const leaf = solidScriptGeometryLeaves(result.shapes).find((entry) => entry.kind === 'mesh');
  if (leaf?.kind !== 'mesh') throw new Error('no mesh');
  return leaf;
}

describe('Merge Points', () => {
  it('leaves a mesh as it is when every corner has its own Merge ID', () => {
    const mesh = meshOf(GRID, { command: 'select_objects' }, { command: 'merge_points' });
    expect(mesh.points).toHaveLength(6);
    expect(mesh.faces).toHaveLength(2);
  });

  it('merges corners sharing a Merge ID into the first of them, at the middle of them all', () => {
    const before = meshOf(GRID).points;
    const mesh = meshOf(
      GRID,
      { command: 'select_objects' },
      { command: 'merge_points', values: { merge_id: '[=Pick([$Index], 0, 1, 2, 3, 1, 5)]' } },
    );
    expect(mesh.points).toHaveLength(5);
    expect(mesh.faces.map((face) => face.length)).toEqual([3, 3]);
    const middle = (before[1] ?? new THREE.Vector3())
      .clone()
      .add(before[4] ?? new THREE.Vector3())
      .multiplyScalar(0.5);
    expect(mesh.points[1]?.distanceTo(middle)).toBeLessThan(1e-9);
    expect(mesh.points[0]?.distanceTo(before[0] ?? new THREE.Vector3())).toBeLessThan(1e-9);
  });

  it('stops on a solid', () => {
    expect(
      solidScriptProgramRun(
        solidScriptDocumentCreate([{ command: 'cube' }, { command: 'select_objects' }, { command: 'merge_points' }]),
      ).error?.message,
    ).toContain('Mesh From Solids');
  });
});
