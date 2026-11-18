import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptShapeLeavesPositive } from '@/solid_script/language/solid_script_shape.js';
import { solidScriptShapeMeshes, type SolidScriptShapeMesh } from '@/solid_script/language/solid_script_mesh.js';
import type { SolidScriptShapeSolid } from '@/solid_script/language/solid_script_shape.js';

const END: SolidScriptLine = { command: 'end' };
const CLIP: SolidScriptLine = { command: 'clip' };
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
 * Solids a run built, flattening groups.
 *
 * @param result Run result.
 * @returns Solids.
 */
function solids(result: ReturnType<typeof run>): SolidScriptShapeSolid[] {
  expect(result.error?.message ?? null).toBeNull();
  return result.shapes.flatMap(solidScriptShapeLeavesPositive).flatMap((leaf) => (leaf.kind === 'solid' ? [leaf] : []));
}

/**
 * The only mesh a run built.
 *
 * @param result Run result.
 * @returns Mesh.
 */
function meshOf(result: ReturnType<typeof run>): SolidScriptShapeMesh {
  expect(result.error?.message ?? null).toBeNull();
  const meshes = solidScriptShapeMeshes(result.shapes);
  expect(meshes).toHaveLength(1);
  const [mesh] = meshes;
  expect(mesh).toBeTruthy();
  return mesh as SolidScriptShapeMesh;
}

/**
 * Rounded axis-aligned bounds of points.
 *
 * @param points Points.
 * @returns Min x, y, z then max.
 */
function bounds(points: readonly THREE.Vector3[]): number[] {
  const box = new THREE.Box3().setFromPoints([...points]);
  return [...box.min.toArray(), ...box.max.toArray()].map((value) => Math.round(value * 100) / 100 + 0);
}

/**
 * The run's error text, or an empty string.
 *
 * @param lines Lines.
 * @returns Message.
 */
function failed(...lines: SolidScriptLine[]): string {
  return run(...lines).error?.message ?? '';
}

describe('SolidScript Clip', () => {
  it('cuts a brush with a plane and keeps it a convex brush', () => {
    const [solid] = solids(run(CUBE, CLIP));
    expect(solid?.kind).toBe('solid');
    expect(bounds(solid?.points ?? [])).toEqual([-1, -1, -1, 1, 0, 1]);
    expect(solids(run(CUBE, { command: 'clip', values: { through: '0, 3, 0' } }))[0]?.points).toHaveLength(8);
  });

  it('cuts a mesh with a plane, keeps it a mesh, and caps the cut', () => {
    const mesh = meshOf(run({ command: 'mesh_brushes' }, CUBE, END, CLIP));
    expect(mesh.kind).toBe('mesh');
    expect(bounds(mesh.points)).toEqual([-1, -1, -1, 1, 0, 1]);
    expect(mesh.faces.length).toBeGreaterThanOrEqual(6);
    const cap = mesh.faces.filter((face) => face.every((index) => Math.abs((mesh.points[index]?.y ?? 1) - 0) < 1e-4));
    expect(cap.length).toBe(1);
    const [loop] = cap;
    expect(loop && loop.length).toBeGreaterThanOrEqual(4);
  });

  it('cuts only the brushes in Of, and leaves a miss unchanged', () => {
    const both = solids(
      run(
        { command: 'cube', values: { size: '2, 2, 2', into: 'A' } },
        { command: 'translate', values: { v: '5, 0, 0' } },
        { command: 'cube', values: { size: '2, 2, 2', into: 'B' } },
        END,
        { command: 'clip', values: { of: '[A]' } },
      ),
    );
    expect(both).toHaveLength(2);
    const heights = both.map((solid) => bounds(solid.points)[4]);
    expect(heights.sort()).toEqual([0, 1]);
  });

  it('stops when Normal is zero, when the plane cuts a brush away, and when nothing is there to cut', () => {
    expect(failed(CUBE, { command: 'clip', values: { normal: '0, 0, 0' } })).toMatch(/Normal must not be 0, 0, 0/);
    expect(failed(CUBE, { command: 'clip', values: { through: '0, 3, 0', normal: '0, -1, 0' } })).toMatch(
      /cut the whole/,
    );
    expect(failed(CLIP)).toMatch(/no brushes to cut/);
    expect(
      failed(
        CUBE,
        { command: 'select_faces', values: { which: 'All', into: 'F' } },
        { command: 'clip', values: { of: '[F]' } },
      ),
    ).toMatch(/needs a Brush/);
  });
});
