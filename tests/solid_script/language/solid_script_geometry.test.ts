import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  solidScriptGeometryBevel,
  solidScriptGeometryEdges,
  solidScriptGeometryFaceMatrix,
  solidScriptGeometryFaces,
  solidScriptGeometryInset,
  solidScriptGeometryMerge,
  solidScriptGeometryPick,
  solidScriptGeometryTags,
  solidScriptGeometryVertices,
} from '@/solid_script/language/solid_script_geometry.js';
import { solidScriptMeshFromSolid } from '@/solid_script/language/solid_script_mesh.js';
import type { SolidScriptShapeSolid } from '@/solid_script/language/solid_script_shape.js';

/**
 * Builds a box solid.
 *
 * @param x Width.
 * @param y Depth.
 * @param z Height.
 * @param role What built it.
 * @returns Solid.
 */
function box(x: number, y: number, z: number, role?: string): SolidScriptShapeSolid {
  const points: THREE.Vector3[] = [];
  for (const a of [-x / 2, x / 2])
    for (const b of [-y / 2, y / 2]) for (const c of [-z / 2, z / 2]) points.push(new THREE.Vector3(a, b, c));
  return { kind: 'solid', label: 'Box', points, ...(role ? { role } : {}) };
}

describe('SolidScript geometry lookups', () => {
  it('reads the faces of a box with centre, direction, size, area and names', () => {
    const faces = solidScriptGeometryFaces([box(2, 4, 1)]);
    expect(faces).toHaveLength(6);
    const top = faces.find((face) => face.normal.y > 0.9)!;
    expect(top.center.toArray()).toEqual([0, 2, 0]);
    expect([top.width, top.height, top.area]).toEqual([2, 1, 2]);
    expect(top.tags).toEqual(['Top']);
    const front = faces.find((face) => face.normal.z > 0.9)!;
    expect([front.width, front.height]).toEqual([2, 4]);
    expect(front.tags).toEqual(['Side']);
    expect(solidScriptGeometryVertices([box(1, 1, 1)])).toHaveLength(8);
    const edges = solidScriptGeometryEdges([box(1, 1, 1)]);
    expect(edges).toHaveLength(12);
    expect(edges.every((edge) => edge.length === 1 && edge.faces[1] !== null)).toBe(true);
  });

  it('names the treads and risers of stairs and the caps of columns', () => {
    expect(solidScriptGeometryTags(new THREE.Vector3(0, 1, 0), 'stairs +x')).toEqual(['Top', 'Step Tread']);
    expect(solidScriptGeometryTags(new THREE.Vector3(-1, 0, 0), 'stairs +x')).toEqual(['Side', 'Riser']);
    expect(solidScriptGeometryTags(new THREE.Vector3(1, 0, 0), 'stairs +x')).toEqual(['Side']);
    expect(solidScriptGeometryTags(new THREE.Vector3(0, -1, 0), 'column')).toEqual(['Bottom', 'Cap']);
  });

  it('picks faces by direction, name, size and number', () => {
    const faces = solidScriptGeometryFaces([box(2, 4, 1), box(1, 1, 1, 'stairs +x')]);
    const up = solidScriptGeometryPick(faces, { by: 'facing', direction: new THREE.Vector3(0, 1, 0), within: 10 });
    expect(up).toHaveLength(2);
    expect(solidScriptGeometryPick(faces, { by: 'tag', tag: 'step tread' })).toHaveLength(1);
    expect(solidScriptGeometryPick(faces, { by: 'biggest', count: 2 }).map((face) => face.area)).toEqual([8, 8]);
    expect(solidScriptGeometryPick(faces, { by: 'numbers', numbers: [0, 11] }).map((face) => face.index)).toEqual([
      0, 11,
    ]);
  });

  it('stands shapes on a face with Y out of it and Z down it', () => {
    const front = solidScriptGeometryFaces([box(2, 2, 2)]).find((face) => face.normal.z > 0.9)!;
    const matrix = solidScriptGeometryFaceMatrix(front);
    const round = (vector: THREE.Vector3) => vector.toArray().map((value) => Math.round(value * 1000) / 1000 + 0);
    expect(round(new THREE.Vector3(0, 1, 0).applyMatrix4(matrix))).toEqual([0, 0, 2]);
    expect(round(new THREE.Vector3(0, 0, 1).applyMatrix4(matrix))).toEqual([0, -1, 1]);
  });

  it('bevels the edges of a box into a convex solid with flat cuts', () => {
    const solid = box(2, 2, 2);
    const topEdges = solidScriptGeometryEdges([solid]).filter((edge) => edge.middle.z > 0.9);
    const bevelled = solidScriptGeometryBevel(solid, topEdges, 0.25);
    const mesh = solidScriptMeshFromSolid(bevelled, 'Box');
    expect(mesh.faces).toHaveLength(10);
    expect(Math.max(...bevelled.map((point) => point.x))).toBeCloseTo(1);
    expect(bevelled.some((point) => point.z > 0.99 && Math.abs(point.x) > 0.76)).toBe(false);
  });

  it('insets mesh faces and merges close points', () => {
    const mesh = solidScriptMeshFromSolid(box(2, 2, 2).points, 'Box');
    const top = mesh.faces.findIndex((loop) => loop.every((corner) => mesh.points[corner]!.z > 0.9));
    const inset = solidScriptGeometryInset(mesh, new Set([top]), 0.25);
    expect(inset.faces).toHaveLength(6 - 1 + 5);
    const inner = inset.faces[top + 4]!.map((corner) => inset.points[corner]!);
    expect(Math.max(...inner.map((point) => Math.abs(point.x)))).toBeCloseTo(0.75);
    const doubled = { ...mesh, points: [...mesh.points, mesh.points[0]!.clone()] };
    expect(solidScriptGeometryMerge(doubled, 0.001).points).toHaveLength(8);
  });
});
