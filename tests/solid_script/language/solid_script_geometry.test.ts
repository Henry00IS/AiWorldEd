import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  solidScriptGeometryBevel,
  solidScriptGeometryEdges,
  solidScriptGeometryEdgesAlong,
  solidScriptGeometryFaceMatrix,
  solidScriptGeometryFaces,
  solidScriptGeometryInset,
  solidScriptGeometryMerge,
  solidScriptGeometryMesh,
  solidScriptGeometryPick,
  solidScriptGeometryTags,
  solidScriptGeometryVertices,
  solidScriptGeometryVerticesAt,
} from '@/solid_script/language/solid_script_geometry.js';
import { solidScriptBodyBox, solidScriptBodyConvex } from '@/solid_script/language/solid_script_body.js';
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
  const half = new THREE.Vector3(x / 2, y / 2, z / 2);
  return { kind: 'solid', label: 'Box', ...solidScriptBodyBox(half.clone().negate(), half), ...(role ? { role } : {}) };
}

describe('SolidScript geometry lookups', () => {
  it('reads the faces of a box with center, direction, size, area and names', () => {
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
    const topEdges = solidScriptGeometryEdges([solid]).filter((edge) => edge.center.z > 0.9);
    const { body } = solidScriptGeometryBevel(solid, topEdges, () => 0.25);
    const bevelled = body.points;
    expect(body.faces).toHaveLength(10);
    expect(solidScriptBodyConvex(body)).toBe(true);
    expect(Math.max(...bevelled.map((point) => point.x))).toBeCloseTo(1);
    expect(bevelled.some((point) => point.z > 0.99 && Math.abs(point.x) > 0.76)).toBe(false);
  });

  it('insets mesh faces and merges close points', () => {
    const mesh = solidScriptGeometryMesh(box(2, 2, 2));
    const top = mesh.faces.findIndex((loop) => loop.every((corner) => mesh.points[corner]!.z > 0.9));
    const inset = solidScriptGeometryInset(mesh, new Map([[top, 0.25]]));
    expect(inset.faces).toHaveLength(6 - 1 + 5);
    const inner = inset.faces[top + 4]!.map((corner) => inset.points[corner]!);
    expect(Math.max(...inner.map((point) => Math.abs(point.x)))).toBeCloseTo(0.75);
    const doubled = { ...mesh, points: [...mesh.points, mesh.points[0]!.clone()] };
    expect(solidScriptGeometryMerge(doubled, 0.001).points).toHaveLength(8);
  });

  it('keeps edges and corners of a leaf after the first read, and not after a replacement', () => {
    const solid = box(1, 1, 1);
    const edges = solidScriptGeometryEdges([solid]);
    const vertices = solidScriptGeometryVertices([solid]);
    expect(solidScriptGeometryEdges([solid])[0]).toBe(edges[0]);
    expect(solidScriptGeometryVertices([solid])[0]).toBe(vertices[0]);
    const moved: SolidScriptShapeSolid = {
      ...solid,
      points: solid.points.map((point) => point.clone().add(new THREE.Vector3(0, 2, 0))),
    };
    const movedEdges = solidScriptGeometryEdges([moved]);
    expect(movedEdges.map((edge) => Math.round((edge.center.y - 2) * 1e6) / 1e6)).toEqual(
      edges.map((edge) => Math.round(edge.center.y * 1e6) / 1e6),
    );
    expect(movedEdges[0]).not.toBe(edges[0]);
    expect(solidScriptGeometryEdges([solid])[0]).toBe(edges[0]);
  });

  it('finds kept edges on a line and kept corners at a point', () => {
    const solid = box(2, 2, 2);
    const edges = solidScriptGeometryEdges([solid]);
    const topFront = edges.find((edge) => edge.center.y === 1 && edge.center.z === 1)!;
    const along = solidScriptGeometryEdgesAlong(solid, topFront.center, topFront.direction);
    expect(along).toEqual([topFront]);
    expect(along[0]).toBe(topFront);
    const corner = solidScriptGeometryVertices([solid])[0]!;
    expect(solidScriptGeometryVerticesAt(solid, corner.position)).toEqual([corner]);
    expect(solidScriptGeometryVerticesAt(solid, new THREE.Vector3(9, 9, 9))).toEqual([]);
    expect(solidScriptGeometryEdgesAlong(solid, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0))).toEqual([]);
  });

  it('reads no edges and no faces from a mesh with no faces, and still lists unused corners', () => {
    const empty = { kind: 'mesh' as const, label: 'empty', points: [], faces: [], uvs: [] };
    expect(solidScriptGeometryFaces([empty])).toEqual([]);
    expect(solidScriptGeometryEdges([empty])).toEqual([]);
    expect(solidScriptGeometryVertices([empty])).toEqual([]);
    const loose = {
      kind: 'mesh' as const,
      label: 'loose',
      points: [new THREE.Vector3(1, 2, 3)],
      faces: [],
      uvs: [],
    };
    expect(solidScriptGeometryEdges([loose])).toEqual([]);
    expect(solidScriptGeometryVertices([loose])).toHaveLength(1);
    expect(solidScriptGeometryVertices([loose])[0]!.position.toArray()).toEqual([1, 2, 3]);
  });

  it('numbers the faces of a second solid’s edges on from the first solid', () => {
    const first = box(1, 1, 1);
    const second: SolidScriptShapeSolid = {
      ...box(1, 1, 1),
      points: box(1, 1, 1).points.map((point) => point.clone().add(new THREE.Vector3(3, 0, 0))),
    };
    const edges = solidScriptGeometryEdges([first, second]);
    expect(edges).toHaveLength(24);
    const later = edges.filter((edge) => edge.center.x > 1);
    expect(later).toHaveLength(12);
    expect(later.every((edge) => edge.faces[0].index >= 6)).toBe(true);
  });
});
