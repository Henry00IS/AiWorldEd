import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptGeometryLeaves } from '@/solid_script/language/solid_script_geometry.js';
import { solidScriptMeshLoopNormal, type SolidScriptShapeMesh } from '@/solid_script/language/solid_script_mesh.js';

/**
 * Runs lines and gives the first mesh of the result.
 *
 * @param lines Lines.
 * @returns Mesh, or the error.
 */
function meshOf(...lines: SolidScriptLine[]): SolidScriptShapeMesh | string {
  const result = solidScriptProgramRun(solidScriptDocumentCreate(lines));
  if (result.error) return result.error.message;
  const [leaf] = solidScriptGeometryLeaves(result.shapes);
  return leaf?.kind === 'mesh' ? leaf : 'no mesh';
}

/** A 1 m cube wrapped as a mesh and picked. */
const CUBE: SolidScriptLine[] = [
  { command: 'mesh_from_solids' },
  { command: 'cube', values: { anchor: 'Center, Center, Center' } },
  { command: 'end' },
  { command: 'select_objects' },
];

/**
 * The faces of a mesh whose normal points along a direction.
 *
 * @param mesh Mesh.
 * @param direction Direction.
 * @returns Face loops.
 */
function facing(mesh: SolidScriptShapeMesh, direction: THREE.Vector3): number[][] {
  return mesh.faces.filter((loop) => solidScriptMeshLoopNormal(mesh.points, loop).dot(direction) > 0.99);
}

/**
 * Sum of face areas, so splitting a face can be checked to keep its surface.
 *
 * @param mesh Mesh.
 * @returns Square metres.
 */
function area(mesh: SolidScriptShapeMesh): number {
  return mesh.faces.reduce((sum, loop) => {
    const points = loop.map((index) => mesh.points[index] ?? new THREE.Vector3());
    const twice = new THREE.Vector3();
    for (let index = 1; index + 1 < points.length; index++)
      twice.add(
        (points[index] ?? twice)
          .clone()
          .sub(points[0] ?? twice)
          .cross((points[index + 1] ?? twice).clone().sub(points[0] ?? twice)),
      );
    return sum + twice.length() / 2;
  }, 0);
}

describe('Flip Faces Where', () => {
  it('flips only the faces that pass Where', () => {
    const mesh = meshOf(...CUBE, { command: 'flip_faces', values: { where: '[=[$NY] > 0.9]' } });
    if (typeof mesh === 'string') throw new Error(mesh);
    expect(facing(mesh, new THREE.Vector3(0, 1, 0))).toHaveLength(0);
    expect(facing(mesh, new THREE.Vector3(0, -1, 0))).toHaveLength(2);
    expect(facing(mesh, new THREE.Vector3(1, 0, 0))).toHaveLength(1);
  });

  it('flips every face of the picked objects when no faces are picked', () => {
    const mesh = meshOf(...CUBE, { command: 'flip_faces' });
    if (typeof mesh === 'string') throw new Error(mesh);
    expect(facing(mesh, new THREE.Vector3(0, 1, 0))).toHaveLength(1);
    const top = facing(mesh, new THREE.Vector3(0, -1, 0)).find((loop) =>
      loop.every((index) => (mesh.points[index]?.y ?? 0) > 0),
    );
    expect(top).toBeDefined();
  });
});

describe('Triangulate', () => {
  it('splits only the faces that pass Where into triangles and keeps the surface', () => {
    const before = meshOf(...CUBE);
    const mesh = meshOf(...CUBE, { command: 'triangulate', values: { where: '[=[$NY] > 0.9]' } });
    if (typeof mesh === 'string' || typeof before === 'string') throw new Error(String(mesh));
    const top = facing(mesh, new THREE.Vector3(0, 1, 0));
    expect(top).toHaveLength(2);
    expect(top.every((loop) => loop.length === 3)).toBe(true);
    expect(facing(mesh, new THREE.Vector3(1, 0, 0)).every((loop) => loop.length === 4)).toBe(true);
    expect(area(mesh)).toBeCloseTo(area(before), 6);
  });

  it('keeps the tags of a face on its triangles', () => {
    const result = solidScriptProgramRun(
      solidScriptDocumentCreate([
        ...CUBE,
        { command: 'clip', values: { through: '0, 0.25, 0', normal: '0, 1, 0' } },
        { command: 'triangulate' },
        { command: 'select_faces', values: { which: 'All', where: '[=HasTag([$Face.Tags], "Cut")]' } },
        { command: 'echo', values: { value: '[=Len([$Selected.Faces])]' } },
      ]),
    );
    expect(result.messages.at(-1)).toBe('2');
  });
});

describe('Split Edges', () => {
  it('gives the faces on either side of a split edge their own corners, and leaves the rest joined', () => {
    const lines: SolidScriptLine[] = [
      { command: 'grid_mesh', values: { size: '2, 0, 2', columns: '2', rows: '1' } },
      { command: 'select_objects' },
    ];
    const before = meshOf(...lines);
    const mesh = meshOf(...lines, {
      command: 'split_edges',
      values: { of: '[$Selected.Objects]', where: '[=Abs([$Edge.Center.X]) < 0.01]' },
    });
    if (typeof mesh === 'string' || typeof before === 'string') throw new Error(String(mesh));
    expect(mesh.points.length - before.points.length).toBe(2);
    const [left, right] = mesh.faces;
    expect(left?.some((index) => right?.includes(index))).toBe(false);
    expect(area(mesh)).toBeCloseTo(area(before), 6);
  });

  it('copies a corner only once per fan of faces cut off around it', () => {
    const mesh = meshOf(...CUBE, { command: 'split_edges' });
    if (typeof mesh === 'string') throw new Error(mesh);
    const shared = mesh.faces.some((loop, face) =>
      mesh.faces.some((other, second) => second !== face && loop.some((index) => other.includes(index))),
    );
    expect(shared).toBe(false);
    expect(mesh.points).toHaveLength(24);
  });
});
