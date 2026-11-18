import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptShapeMeshes, type SolidScriptShapeMesh } from '@/solid_script/language/solid_script_mesh.js';

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
 * The mesh a Grid Mesh line built, or the error.
 *
 * @param values Field values.
 * @returns Mesh, or the error message.
 */
function grid(values: Record<string, string> = {}): SolidScriptShapeMesh | string {
  const result = run({ command: 'grid_mesh', values });
  if (result.error) return result.error.message;
  const meshes = solidScriptShapeMeshes(result.shapes);
  const [mesh, ...rest] = meshes;
  expect(rest).toHaveLength(0);
  expect(mesh).toBeDefined();
  return mesh ?? { kind: 'mesh', label: 'missing', points: [], faces: [], uvs: [] };
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
 * Unit normal of the first face.
 *
 * @param mesh Mesh.
 * @returns Normal, or null.
 */
function firstNormal(mesh: SolidScriptShapeMesh): number[] | null {
  const face = mesh.faces[0];
  const a = face ? mesh.points[face[0] ?? -1] : undefined;
  const b = face ? mesh.points[face[1] ?? -1] : undefined;
  const c = face ? mesh.points[face[2] ?? -1] : undefined;
  if (!a || !b || !c) return null;
  const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
  return xyz(normal);
}

describe('SolidScript Grid Mesh', () => {
  it('builds a ground grid centred on the origin, facing up', () => {
    const mesh = grid({ size: '2, 0, 2', columns: '1', rows: '1' });
    if (typeof mesh === 'string') throw new Error(mesh);
    expect(mesh.points.map(xyz).sort((left, right) => left.join().localeCompare(right.join()))).toEqual([
      [-1, 0, -1],
      [-1, 0, 1],
      [1, 0, -1],
      [1, 0, 1],
    ]);
    expect(mesh.faces).toHaveLength(1);
    expect(firstNormal(mesh)).toEqual([0, 1, 0]);
    expect(mesh.uvs[0]).toEqual([
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
    ]);
  });

  it('stands a wall on the origin and subdivides it', () => {
    const mesh = grid({ size: '2, 2, 0', columns: '2', rows: '1', anchor: 'Left, Bottom, Center' });
    if (typeof mesh === 'string') throw new Error(mesh);
    expect(mesh.points).toHaveLength(6);
    expect(mesh.faces).toHaveLength(2);
    expect(mesh.points.map(xyz)).toEqual([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [0, 2, 0],
      [1, 2, 0],
      [2, 2, 0],
    ]);
    expect(firstNormal(mesh)).toEqual([0, 0, 1]);
  });

  it('stops when the size is not flat, or a count is out of range', () => {
    expect(grid({ size: '2, 2, 2' })).toMatch(/2, 0, 2/);
    expect(grid({ size: '-1, 0, 2' })).toMatch(/0 or more/);
    expect(grid({ columns: '0' })).toMatch(/Columns must be a whole number from 1 to 256/);
    expect(grid({ rows: '1.5' })).toMatch(/Rows must be a whole number from 1 to 256/);
  });
});
