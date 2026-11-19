import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptShapeMeshes } from '@/solid_script/language/solid_script_mesh.js';
import { solidScriptShapeLeavesPositive } from '@/solid_script/language/solid_script_shape.js';

const END: SolidScriptLine = { command: 'end' };
const CUBE: SolidScriptLine = { command: 'cube', values: { size: '2, 2, 2' } };

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
 * @param point Point.
 * @returns Rounded components.
 */
function xyz(point: THREE.Vector3): number[] {
  return [point.x, point.y, point.z].map((value) => Math.round(value * 1e6) / 1e6);
}

/**
 * Points of the one solid a run built, or the error.
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

describe('SolidScript Scale Faces', () => {
  it('leaves a face as it is at Factor 1, and shrinks a top face toward its center', () => {
    const pick = { command: 'select_faces', values: { which: 'Facing Up' } };
    expect(solidPoints(CUBE, pick, { command: 'scale_faces', values: { factor: '1' } })).toEqual(solidPoints(CUBE));
    expect(solidPoints(CUBE, pick, { command: 'scale_faces', values: { factor: '0.5' } })).toEqual(
      [
        [-1, -1, -1],
        [-1, -1, 1],
        [-0.5, 1, -0.5],
        [-0.5, 1, 0.5],
        [0.5, 1, -0.5],
        [0.5, 1, 0.5],
        [1, -1, -1],
        [1, -1, 1],
      ].sort((left, right) => left.join().localeCompare(right.join())),
    );
  });

  it('keeps a brush as a brush, and scales a mesh face in place', () => {
    const scaled = run(
      CUBE,
      { command: 'select_faces', values: { which: 'Facing Up' } },
      {
        command: 'scale_faces',
        values: { factor: '0.5' },
      },
    );
    expect(scaled.error).toBeNull();
    expect(solidScriptShapeMeshes(scaled.shapes)).toHaveLength(0);
    const meshed = run(
      { command: 'mesh_brushes' },
      CUBE,
      END,
      { command: 'select_faces', values: { which: 'Facing Up' } },
      { command: 'scale_faces', values: { factor: '0.5' } },
    );
    expect(meshed.error).toBeNull();
    const meshes = solidScriptShapeMeshes(meshed.shapes);
    const [mesh] = meshes;
    expect(meshes).toHaveLength(1);
    expect(mesh && mesh.points.some((point) => Math.abs(point.y - 1) < 1e-6 && Math.abs(point.x) === 0.5)).toBe(true);
  });

  it('stops when there are no faces', () => {
    const result = run({ command: 'scale_faces', values: { factor: '0.5' } });
    expect(result.error?.message ?? '').toMatch(/Select Faces/);
  });
});
