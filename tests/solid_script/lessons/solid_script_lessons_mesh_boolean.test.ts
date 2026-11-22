import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import type { SolidScriptShapeMesh } from '@/solid_script/language/solid_script_mesh.js';
import { solidScriptShapeMeshesCut } from '@/solid_script/language/solid_script_mesh_modes.js';

/**
 * A Mesh From Solids block around one cube.
 *
 * @param size Cube size.
 * @param mode Mode of the block.
 * @param at Where the cube is moved to.
 * @returns Lines.
 */
function cubeMesh(size: string, mode: string, at = '0, 0, 0'): SolidScriptLine[] {
  return [
    { command: 'mesh_from_solids', values: mode === '' ? {} : { mode } },
    { command: 'transform', values: { move: at } },
    { command: 'cube', values: { size, anchor: 'Center, Center, Center' } },
    { command: 'end' },
    { command: 'end' },
  ];
}

/**
 * Runs lines and gives the meshes shown.
 *
 * @param lines Lines.
 * @returns Meshes, or the error.
 */
function shown(...lines: SolidScriptLine[]): SolidScriptShapeMesh[] | string {
  const result = solidScriptProgramRun(solidScriptDocumentCreate(lines));
  if (result.error) return result.error.message;
  return solidScriptShapeMeshesCut(result.shapes);
}

/**
 * Volume a closed mesh holds.
 *
 * @param mesh Mesh.
 * @returns Cubic metres.
 */
function volume(mesh: SolidScriptShapeMesh): number {
  let total = 0;
  for (const loop of mesh.faces) {
    const first = mesh.points[loop[0] ?? 0] ?? new THREE.Vector3();
    for (let index = 1; index + 1 < loop.length; index++) {
      const b = mesh.points[loop[index] ?? 0] ?? new THREE.Vector3();
      const c = mesh.points[loop[index + 1] ?? 0] ?? new THREE.Vector3();
      total += first.dot(b.clone().cross(c)) / 6;
    }
  }
  return total;
}

describe('Mesh Mode', () => {
  it('Subtractive cuts a mesh out of the one before it', () => {
    const meshes = shown(...cubeMesh('2, 2, 2', ''), ...cubeMesh('1, 1, 1', 'Subtractive', '1, 1, 1'));
    if (typeof meshes === 'string') throw new Error(meshes);
    expect(meshes).toHaveLength(1);
    expect(volume(meshes[0] as SolidScriptShapeMesh)).toBeCloseTo(8 - 0.125, 5);
  });

  it('Intersecting keeps only the overlap', () => {
    const meshes = shown(...cubeMesh('2, 2, 2', ''), ...cubeMesh('2, 2, 2', 'Intersecting', '1, 1, 1'));
    if (typeof meshes === 'string') throw new Error(meshes);
    expect(meshes).toHaveLength(1);
    expect(volume(meshes[0] as SolidScriptShapeMesh)).toBeCloseTo(1, 5);
  });

  it('a Mode on a hand-built Mesh cuts too', () => {
    const corners = [
      '-1, -1, -1',
      '1, -1, -1',
      '1, 1, -1',
      '-1, 1, -1',
      '-1, -1, 1',
      '1, -1, 1',
      '1, 1, 1',
      '-1, 1, 1',
    ];
    const faces = ['0, 3, 2, 1', '4, 5, 6, 7', '0, 1, 5, 4', '1, 2, 6, 5', '2, 3, 7, 6', '3, 0, 4, 7'];
    const meshes = shown(
      ...cubeMesh('4, 4, 4', ''),
      { command: 'mesh', values: { mode: 'Subtractive' } },
      ...corners.map((position) => ({ command: 'vertex', values: { position } })),
      ...faces.map((face) => ({ command: 'face', values: { corners: face } })),
      { command: 'end' },
    );
    if (typeof meshes === 'string') throw new Error(meshes);
    expect(volume(meshes[0] as SolidScriptShapeMesh)).toBeCloseTo(64 - 8, 5);
  });

  it('a Subtractive Group of meshes cuts as one', () => {
    const meshes = shown(
      ...cubeMesh('4, 4, 4', ''),
      { command: 'group', values: { mode: 'Subtractive' } },
      ...cubeMesh('1, 1, 1', '', '2, 2, 2'),
      ...cubeMesh('1, 1, 1', '', '-2, -2, -2'),
      { command: 'end' },
    );
    if (typeof meshes === 'string') throw new Error(meshes);
    expect(meshes).toHaveLength(1);
    expect(volume(meshes[0] as SolidScriptShapeMesh)).toBeCloseTo(64 - 0.25, 5);
  });

  it('a mesh cut away completely is gone, and plain meshes stay apart', () => {
    const gone = shown(...cubeMesh('1, 1, 1', ''), ...cubeMesh('2, 2, 2', 'Subtractive'));
    expect(gone).toEqual([]);
    const apart = shown(...cubeMesh('1, 1, 1', ''), ...cubeMesh('1, 1, 1', '', '5, 0, 0'));
    expect(typeof apart === 'string' ? apart : apart.length).toBe(2);
  });
});
