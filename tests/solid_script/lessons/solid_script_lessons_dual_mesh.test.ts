import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptGeometryLeaves } from '@/solid_script/language/solid_script_geometry.js';
import type { SolidScriptShapeMesh } from '@/solid_script/language/solid_script_mesh.js';

/** A flat grid of four faces round one inner corner. */
const GRID: SolidScriptLine = { command: 'grid_mesh', values: { size: '2, 0, 2', columns: '2', rows: '2' } };

/** A cube baked into a mesh. */
const CUBE: SolidScriptLine[] = [
  { command: 'mesh_from_solids', values: {} },
  { command: 'cube', values: { size: '2' } },
  { command: 'end', values: {} },
  { command: 'select_objects' },
];

/**
 * Runs lines and gives the first mesh they make, or the error.
 *
 * @param lines Lines.
 * @returns Mesh or message.
 */
function meshOf(...lines: SolidScriptLine[]): SolidScriptShapeMesh | string {
  const result = solidScriptProgramRun(solidScriptDocumentCreate(lines));
  if (result.error) return result.error.message;
  const leaf = solidScriptGeometryLeaves(result.shapes).find((entry) => entry.kind === 'mesh');
  return leaf?.kind === 'mesh' ? leaf : 'no mesh';
}

/**
 * Says whether every face of a closed mesh around the origin faces outwards.
 *
 * @param mesh Mesh.
 * @returns True when every face normal points away from the origin.
 */
function facesOutward(mesh: SolidScriptShapeMesh): boolean {
  return mesh.faces.every((face) => {
    const corners = face.map((index) => mesh.points[index] ?? new THREE.Vector3());
    const normal = new THREE.Vector3();
    corners.forEach((corner, at) => normal.add(corner.clone().cross(corners[(at + 1) % corners.length] ?? corner)));
    const center = corners.reduce((sum, corner) => sum.add(corner), new THREE.Vector3());
    return normal.dot(center) > 0;
  });
}

describe('Dual Mesh', () => {
  it('turns a cube into an octahedron: a corner per face and a face per corner, facing out', () => {
    const mesh = meshOf(...CUBE, { command: 'dual_mesh' });
    if (typeof mesh === 'string') throw new Error(mesh);
    expect(mesh.points).toHaveLength(6);
    expect(mesh.faces.map((face) => face.length)).toEqual([3, 3, 3, 3, 3, 3, 3, 3]);
    for (const point of mesh.points) expect(point.length()).toBeCloseTo(1, 9);
    expect(facesOutward(mesh)).toBe(true);
  });

  it('gives back a cube from the dual of the dual', () => {
    const mesh = meshOf(...CUBE, { command: 'dual_mesh' }, { command: 'dual_mesh' });
    if (typeof mesh === 'string') throw new Error(mesh);
    expect(mesh.faces.map((face) => face.length)).toEqual([4, 4, 4, 4, 4, 4]);
    expect(facesOutward(mesh)).toBe(true);
  });

  it('drops the corners on an open edge unless Keep Boundaries is on', () => {
    const open = meshOf(GRID, { command: 'select_objects' }, { command: 'dual_mesh' });
    if (typeof open === 'string') throw new Error(open);
    expect(open.faces.map((face) => face.length)).toEqual([4]);
    const kept = meshOf(
      GRID,
      { command: 'select_objects' },
      { command: 'dual_mesh', values: { keep_boundaries: 'Yes' } },
    );
    if (typeof kept === 'string') throw new Error(kept);
    expect(kept.faces.map((face) => face.length).sort((a, b) => a - b)).toEqual([4, 4, 4, 4, 4, 5, 5, 5, 5]);
    const facing = (mesh: SolidScriptShapeMesh): number[] =>
      mesh.faces.map((face) => {
        const corners = face.map((index) => mesh.points[index] ?? new THREE.Vector3());
        const normal = new THREE.Vector3();
        corners.forEach((corner, at) => normal.add(corner.clone().cross(corners[(at + 1) % corners.length] ?? corner)));
        return Math.sign(normal.y);
      });
    const plain = meshOf(GRID);
    if (typeof plain === 'string') throw new Error(plain);
    const side = facing(plain)[0];
    expect(facing(kept).every((sign) => sign === side)).toBe(true);
  });

  it('stops on a solid', () => {
    expect(meshOf({ command: 'cube', values: {} }, { command: 'select_objects' }, { command: 'dual_mesh' })).toMatch(
      /Mesh From Solids/,
    );
  });
});
