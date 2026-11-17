import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptMeshFromSolid,
  solidScriptMeshLoopNormal,
  solidScriptMeshLoopCentre,
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
  expect(result.error).toBeNull();
  const meshes = solidScriptShapeMeshes(result.shapes);
  expect(meshes).toHaveLength(1);
  return meshes[0]!;
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
    return normal.dot(solidScriptMeshLoopCentre(mesh.points, face).sub(middle)) > 0;
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

describe('SolidScript meshes', () => {
  it('builds a mesh from Vertex and Face lines, with texture coordinates when every corner has one', () => {
    const mesh = onlyMesh(
      run(
        { command: 'mesh' },
        { command: 'vertex', values: { position: '0, 0, 0', uv: '0, 0' } },
        { command: 'vertex', values: { position: '1, 0, 0', uv: '1, 0' } },
        { command: 'translate', values: { v: '0, 0, 2' } },
        { command: 'vertex', values: { position: '0, 1, 0', uv: '0, 1' } },
        END,
        { command: 'face', values: { corners: '0, 1, 2' } },
        END,
      ),
    );
    expect(mesh.points.map((point) => point.toArray())).toEqual([
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 2],
    ]);
    expect(mesh.faces).toEqual([[0, 1, 2]]);
    expect(mesh.uvs).toEqual([
      [
        [0, 0],
        [1, 0],
        [0, 1],
      ],
    ]);
  });

  it('builds a pyramid Mesh with outward faces', () => {
    const vertices = ['-1, -1, 0', '1, -1, 0', '1, 1, 0', '-1, 1, 0', '0, 0, 1.5'];
    const faces = ['0, 3, 2, 1', '0, 1, 4', '1, 2, 4', '2, 3, 4', '3, 0, 4'];
    const mesh = onlyMesh(
      run(
        { command: 'mesh' },
        ...vertices.map((position) => ({ command: 'vertex', values: { position } })),
        ...faces.map((corners) => ({ command: 'face', values: { corners } })),
        END,
      ),
    );
    expect(mesh.points).toHaveLength(5);
    expect(mesh.faces).toHaveLength(5);
    expect(outwards(mesh)).toBe(true);
  });

  it('explains faces with missing corners and lines in the wrong block', () => {
    const missing = run(
      { command: 'mesh' },
      { command: 'vertex' },
      { command: 'face', values: { corners: '0, 1, 2' } },
      END,
    );
    expect(missing.error?.message).toMatch(/face 0 uses point 1, but the mesh has points 0 to 0/);
    expect(run({ command: 'face' }, { command: 'cube' }).error?.message).toMatch(/a Face belongs between a Mesh line/);
    const point = run({ command: 'mesh' }, { command: 'point' }, END);
    expect(point.error?.message).toMatch(/a Mesh takes Vertex lines/);
    const cut = run(
      { command: 'difference' },
      { command: 'cube' },
      { command: 'mesh_brushes' },
      { command: 'sphere' },
      END,
      END,
    );
    expect(cut.error?.message).toMatch(/a mesh cannot be cut/);
  });

  it('turns shapes into closed outward meshes and keeps brushes for the rest', () => {
    const result = run({ command: 'mesh_brushes' }, { command: 'cube', values: { size: '2, 2, 2' } }, END, {
      command: 'sphere',
    });
    const mesh = onlyMesh(result);
    expect(mesh.points).toHaveLength(8);
    expect(mesh.faces).toHaveLength(6);
    expect(outwards(mesh)).toBe(true);
    expect(result.shapes.filter((shape) => shape.kind === 'solid')).toHaveLength(1);
  });

  it('subdivides smoothly into a rounded mesh, or keeps the shape when not smooth', () => {
    const flat = onlyMesh(run({ command: 'subdivide', values: { smooth: 'false' } }, { command: 'cube' }, END));
    expect(flat.faces).toHaveLength(24);
    expect(bounds(flat)).toEqual([-0.5, -0.5, -0.5, 0.5, 0.5, 0.5]);
    const round = onlyMesh(run({ command: 'subdivide', values: { levels: '2' } }, { command: 'cube' }, END));
    expect(round.faces).toHaveLength(96);
    expect(outwards(round)).toBe(true);
    const corner = Math.max(...round.points.map((point) => point.length()));
    expect(corner).toBeLessThan(Math.sqrt(3) * 0.5 - 0.1);
  });

  it('displaces points by a formula of their position and normal', () => {
    const mesh = onlyMesh(
      run({ command: 'displace', values: { distance: '[=[nz] > 0.5 ? 1 : 0]' } }, { command: 'cube' }, END),
    );
    const out = Math.round((0.5 + 1 / Math.sqrt(3)) * 100) / 100;
    expect(bounds(mesh)).toEqual([-out, -out, -0.5, out, out, out]);
  });

  it('extrudes only the faces the condition picks', () => {
    const mesh = onlyMesh(run({ command: 'extrude_faces' }, { command: 'cube' }, END));
    expect(mesh.faces).toHaveLength(6 + 4);
    expect(bounds(mesh)).toEqual([-0.5, -0.5, -0.5, 0.5, 0.5, 1]);
    expect(outwards(mesh)).toBe(true);
  });

  it('smooths, flips and maps texture coordinates', () => {
    const smooth = onlyMesh(
      run(
        { command: 'mesh_smooth', values: { rounds: '3' } },
        { command: 'subdivide', values: { smooth: 'false' } },
        { command: 'cube' },
        END,
        END,
      ),
    );
    expect(Math.max(...smooth.points.map((point) => point.length()))).toBeLessThan(0.85);
    const flipped = onlyMesh(run({ command: 'flip_faces' }, { command: 'cube' }, END));
    expect(outwards(flipped)).toBe(false);
    const mapped = onlyMesh(run({ command: 'box_uvs', values: { size: '0.5' } }, { command: 'cube' }, END));
    expect(mapped.uvs.every((uv) => uv !== null && uv.every(([u, v]) => Math.abs(u) === 1 && Math.abs(v) === 1))).toBe(
      true,
    );
  });

  it('mirrors meshes without turning them inside out', () => {
    const mesh = onlyMesh(run({ command: 'mirror' }, { command: 'mesh_brushes' }, { command: 'cube' }, END, END));
    expect(outwards(mesh)).toBe(true);
    expect(
      outwards(
        solidScriptMeshFromSolid(
          [
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(1, 0, 0),
            new THREE.Vector3(0, 1, 0),
            new THREE.Vector3(0, 0, 1),
          ],
          'tetra',
        ),
      ),
    ).toBe(true);
  });
});
