import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import type { SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptShapeMeshes } from '@/solid_script/language/solid_script_mesh.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Runs lines and measures the box around the meshes they make.
 *
 * @param lines Lines.
 * @returns Box size.
 */
function size(lines: SolidScriptLine[]): THREE.Vector3 {
  const result = solidScriptProgramRun(solidScriptDocumentCreate(lines));
  expect(result.error?.message).toBeUndefined();
  const box = new THREE.Box3();
  solidScriptShapeMeshes(result.shapes).forEach((mesh) => mesh.points.forEach((point) => box.expandByPoint(point)));
  return box.getSize(new THREE.Vector3());
}

/**
 * A cube of size 2 as a mesh, subdivided twice.
 *
 * @param values Extra Subdivide fields.
 * @returns Lines.
 */
function cube(values: Record<string, string>): SolidScriptLine[] {
  return [
    { command: 'mesh_from_solids' },
    { command: 'cube', values: { size: '2' } },
    { command: 'end' },
    { command: 'select_objects' },
    { command: 'subdivide', values: { levels: '2', ...values } },
  ];
}

describe('Subdivide Crease and Keep Corners', () => {
  it('keeps creased edges sharp while Smooth rounds the rest', () => {
    expect(size(cube({})).x).toBeLessThan(1.9);
    expect(size(cube({ crease: '[=[$Edge.Angle] > 60]' })).x).toBeCloseTo(2, 9);
  });

  it('holds the corners of an open mesh with Keep Corners', () => {
    const corner = (keep: string): boolean => {
      const result = solidScriptProgramRun(
        solidScriptDocumentCreate([
          { command: 'grid_mesh', values: { size: '2, 0, 2', columns: '2', rows: '2' } },
          { command: 'select_objects' },
          { command: 'subdivide', values: { keep_corners: keep } },
        ]),
      );
      return solidScriptShapeMeshes(result.shapes).some((mesh) =>
        mesh.points.some((point) => point.distanceTo(new THREE.Vector3(1, 0, 1)) < 1e-9),
      );
    };
    expect(corner('No')).toBe(false);
    expect(corner('Yes')).toBe(true);
  });
});
