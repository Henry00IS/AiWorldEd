import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { solidScriptShapeClone } from '@/solid_script/language/solid_script_shape_clone.js';
import { solidScriptStructureClone } from '@/solid_script/language/solid_script_structure_clone.js';
import type { SolidScriptShapeSolid } from '@/solid_script/language/solid_script_shape.js';
import type { SolidScriptShapeMesh } from '@/solid_script/language/solid_script_mesh.js';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';

/**
 * Finds every object, array, vector and matrix two structures hold in common.
 *
 * @param a First structure.
 * @param b Second structure.
 * @param path Where the walk is, for the report.
 * @returns Paths that are the very same object in both.
 */
function shared(a: unknown, b: unknown, path = 'value'): string[] {
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return [];
  if (a === b) return [path];
  return Object.keys(a).flatMap((key) =>
    shared((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], `${path}.${key}`),
  );
}

/**
 * Makes a solid with every optional field filled in.
 *
 * @returns Solid.
 */
function fullSolid(): SolidScriptShapeSolid {
  const point = new THREE.Vector3(1, 2, 3);
  const normal = new THREE.Vector3(0, 1, 0);
  return {
    kind: 'solid',
    points: [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)],
    faces: [[0, 1, 2]],
    label: 'Crate',
    mode: 'Subtractive',
    role: 'stairs +x',
    texture: 'brick',
    faceTextures: [{ point: point.clone(), normal: normal.clone(), texture: 'grass' }],
    faceSmooth: [{ point: point.clone(), normal: normal.clone(), angle: 30 }],
    boxUvSize: 2,
    faceUvs: [{ point: point.clone(), normal: normal.clone(), uv: SurfaceUvMatrix.identity() }],
    faceTags: [{ point: point.clone(), normal: normal.clone(), tag: 'Roof' }],
    uvPolicy: { textures: 'world', readable: false, shiftU: 1, shiftV: 2 },
    uvCarry: new THREE.Matrix4().makeTranslation(1, 2, 3),
    received: {
      index: 1,
      matrix: new THREE.Matrix4().makeScale(2, 2, 2),
      textures: 'copied',
      clip: { normal: [0, 1, 0], constant: 1 },
    },
    clippedBy: { normal: normal.clone(), constant: 2 },
  };
}

/**
 * Makes a mesh with every optional field filled in.
 *
 * @returns Mesh.
 */
function fullMesh(): SolidScriptShapeMesh {
  const point = new THREE.Vector3(1, 2, 3);
  const normal = new THREE.Vector3(0, 1, 0);
  return {
    kind: 'mesh',
    label: 'Sheet',
    points: [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)],
    faces: [[0, 1, 2]],
    uvs: [
      [
        [0, 0],
        [1, 0],
        [0, 1],
      ],
      null,
    ],
    texture: 'brick',
    faceTags: [{ point: point.clone(), normal: normal.clone(), tag: 'Inner' }],
    faceTextures: [{ point: point.clone(), normal: normal.clone(), texture: 'grass' }],
    mode: 'Intersecting',
    uvCarry: new THREE.Matrix4().makeTranslation(1, 2, 3),
  };
}

describe('Copying the geometry of an object shares nothing', () => {
  it('copies a solid with every field filled in, and nothing in it is the original', () => {
    const solid = fullSolid();
    const copy = solidScriptShapeClone(solid);
    expect(copy).toEqual(solid);
    expect(shared(solid, copy)).toEqual([]);
  });

  it('copies a mesh with every field filled in, and nothing in it is the original', () => {
    const mesh = fullMesh();
    const copy = solidScriptShapeClone(mesh);
    expect(copy).toEqual(mesh);
    expect(shared(mesh, copy)).toEqual([]);
  });

  it('changing any part of the copy leaves the original as it was', () => {
    const solid = fullSolid();
    const copy = solidScriptShapeClone(solid) as SolidScriptShapeSolid;
    copy.faces[0]!.push(9);
    copy.points[0]!.set(9, 9, 9);
    copy.uvPolicy!.shiftU = 7;
    copy.faceUvs![0]!.uv.u.set(9, 9, 9, 9);
    copy.faceTags![0]!.tag = 'Other';
    copy.received!.matrix.makeTranslation(9, 9, 9);
    copy.received!.clip!.normal = [1, 0, 0];
    copy.clippedBy!.normal.set(1, 0, 0);
    expect(solid).toEqual(fullSolid());
  });

  it('copies any structure of arrays, plain objects and vectors, and keeps text and numbers', () => {
    const value = { list: [1, [2, 3]], inner: { vector: new THREE.Vector3(1, 2, 3) }, text: 'a', none: null };
    const copy = solidScriptStructureClone(value);
    expect(copy).toEqual(value);
    expect(shared(value, copy)).toEqual([]);
    expect(solidScriptStructureClone(5)).toBe(5);
    expect(solidScriptStructureClone('x')).toBe('x');
  });
});
