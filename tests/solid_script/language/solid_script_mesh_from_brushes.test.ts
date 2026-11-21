import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptMeshLoopCenter,
  solidScriptMeshLoopNormal,
  solidScriptShapeMeshes,
  type SolidScriptShapeMesh,
} from '@/solid_script/language/solid_script_mesh.js';

const END: SolidScriptLine = { command: 'end' };

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
 * Returns the only mesh a run built.
 *
 * @param result Run result.
 * @returns Mesh.
 */
function onlyMesh(result: ReturnType<typeof run>): SolidScriptShapeMesh {
  expect(result.error?.message ?? null).toBeNull();
  const meshes = solidScriptShapeMeshes(result.shapes);
  expect(meshes).toHaveLength(1);
  const mesh = meshes[0];
  if (!mesh) throw new Error('Expected a mesh');
  return mesh;
}

/**
 * Checks that every face of a closed mesh faces away from its middle.
 *
 * @param mesh Mesh.
 * @returns True when all faces face outwards.
 */
function outwards(mesh: SolidScriptShapeMesh): boolean {
  const middle = mesh.points
    .reduce((sum, point) => sum.add(point), new THREE.Vector3())
    .divideScalar(mesh.points.length);
  return mesh.faces.every((face) => {
    const normal = solidScriptMeshLoopNormal(mesh.points, face);
    return normal.dot(solidScriptMeshLoopCenter(mesh.points, face).sub(middle)) > 0;
  });
}

/**
 * Rounded bounds of a mesh.
 *
 * @param mesh Mesh.
 * @returns Min x, y, z then max.
 */
function bounds(mesh: SolidScriptShapeMesh): number[] {
  const box = new THREE.Box3().setFromPoints(mesh.points);
  return [...box.min.toArray(), ...box.max.toArray()].map((value) => Math.round(value * 100) / 100 + 0);
}

/** A centred unit cube. */
const CUBE: SolidScriptLine = { command: 'cube', values: { size: '1, 1, 1', anchor: 'Center, Center, Center' } };

describe('SolidScript Mesh From Solids baking', () => {
  it('bakes one cube into a closed outward mesh of six faces and eight corners', () => {
    const mesh = onlyMesh(run({ command: 'mesh_from_solids' }, CUBE, END));
    expect(mesh.points).toHaveLength(8);
    expect(mesh.faces).toHaveLength(6);
    expect(outwards(mesh)).toBe(true);
    expect(bounds(mesh)).toEqual([-0.5, -0.5, -0.5, 0.5, 0.5, 0.5]);
    expect(mesh.uvs.every((face) => face !== null && face.length === 4)).toBe(true);
  });

  it('cuts a subtractive notch instead of keeping both brushes as uncut hulls', () => {
    const mesh = onlyMesh(
      run(
        { command: 'mesh_from_solids' },
        { command: 'cube', values: { size: '2, 2, 2', anchor: 'Center, Center, Center' } },
        { command: 'transform', values: { move: '0.75, 0, 0' } },
        { command: 'cube', values: { size: '1, 1, 1', anchor: 'Center, Center, Center', mode: 'Subtractive' } },
        END,
        END,
      ),
    );
    expect(bounds(mesh)).toEqual([-1, -1, -1, 1, 1, 1]);
    expect(mesh.faces.length).toBeGreaterThan(6);
    expect(mesh.points.length).toBeGreaterThan(8);
    expect(mesh.points.some((point) => Math.abs(point.x - 0.25) < 0.05)).toBe(true);
  });

  it('unions two touching cubes so the shared wall is gone', () => {
    const mesh = onlyMesh(
      run(
        { command: 'mesh_from_solids' },
        { command: 'transform', values: { move: '-0.5, 0, 0' } },
        CUBE,
        END,
        { command: 'transform', values: { move: '0.5, 0, 0' } },
        CUBE,
        END,
        END,
      ),
    );
    expect(outwards(mesh)).toBe(true);
    expect(bounds(mesh)).toEqual([-1, -0.5, -0.5, 1, 0.5, 0.5]);
    expect(mesh.faces.length).toBeLessThan(12);
    expect(mesh.points.length).toBeLessThan(16);
  });

  it('keeps a subtractive brush inside a group from cutting a brush outside it', () => {
    const cut = onlyMesh(
      run(
        { command: 'mesh_from_solids' },
        { command: 'cube', values: { size: '2, 2, 2', anchor: 'Center, Center, Center' } },
        { command: 'cube', values: { size: '1, 1, 3', anchor: 'Center, Center, Center', mode: 'Subtractive' } },
        END,
      ),
    );
    const grouped = onlyMesh(
      run(
        { command: 'mesh_from_solids' },
        { command: 'cube', values: { size: '2, 2, 2', anchor: 'Center, Center, Center' } },
        { command: 'group' },
        { command: 'transform', values: { move: '3, 0, 0' } },
        { command: 'cube', values: { size: '2, 2, 2', anchor: 'Center, Center, Center' } },
        { command: 'cube', values: { size: '1, 1, 3', anchor: 'Center, Center, Center', mode: 'Subtractive' } },
        END,
        END,
        END,
      ),
    );
    expect(cut.faces.length).toBeGreaterThan(6);
    expect(grouped.points.some((point) => point.x < -0.9)).toBe(true);
    expect(grouped.points.some((point) => point.x > 3.9)).toBe(true);
    const nearOrigin = grouped.points.filter((point) => point.x < 1.1);
    const box = new THREE.Box3().setFromPoints(nearOrigin);
    expect([...box.min.toArray(), ...box.max.toArray()].map((value) => Math.round(value * 100) / 100 + 0)).toEqual([
      -1, -1, -1, 1, 1, 1,
    ]);
  });

  it('stops when subtractive brushes remove everything', () => {
    const result = run(
      { command: 'mesh_from_solids' },
      CUBE,
      { command: 'cube', values: { size: '2, 2, 2', anchor: 'Center, Center, Center', mode: 'Subtractive' } },
      END,
    );
    expect(result.error?.message ?? '').toMatch(/nothing left/);
    expect(solidScriptShapeMeshes(result.shapes)).toHaveLength(0);
  });
});
