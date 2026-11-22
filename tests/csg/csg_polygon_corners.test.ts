import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CsgBooleanOps, CsgOperation } from '@/csg/csg_boolean_ops.js';
import { CsgPolygon } from '@/csg/csg_polygon.js';

/**
 * Builds the six faces of a box, each corner with its own texture coordinate.
 *
 * @param size Edge length.
 * @param center Box centre.
 * @returns Polygons facing out.
 */
function box(size: number, center: THREE.Vector3): CsgPolygon[] {
  const h = size / 2;
  const at = (x: number, y: number, z: number) => new THREE.Vector3(x * h, y * h, z * h).add(center);
  const quads: [number, number, number][][] = [
    [
      [-1, -1, 1],
      [1, -1, 1],
      [1, 1, 1],
      [-1, 1, 1],
    ],
    [
      [1, -1, -1],
      [-1, -1, -1],
      [-1, 1, -1],
      [1, 1, -1],
    ],
    [
      [1, -1, 1],
      [1, -1, -1],
      [1, 1, -1],
      [1, 1, 1],
    ],
    [
      [-1, -1, -1],
      [-1, -1, 1],
      [-1, 1, 1],
      [-1, 1, -1],
    ],
    [
      [-1, 1, 1],
      [1, 1, 1],
      [1, 1, -1],
      [-1, 1, -1],
    ],
    [
      [-1, -1, -1],
      [1, -1, -1],
      [1, -1, 1],
      [-1, -1, 1],
    ],
  ];
  const uvs: [number, number][] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  return quads.map(
    (quad) =>
      new CsgPolygon(
        quad.map(([x, y, z]) => at(x, y, z)),
        null,
        uvs,
      ),
  );
}

describe('CsgPolygon corners', () => {
  it('finds the plane even when the first three corners lie on a line', () => {
    const polygon = new CsgPolygon([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(2, 0, 0),
      new THREE.Vector3(2, 1, 0),
      new THREE.Vector3(0, 1, 0),
    ]);
    expect(polygon.getPlaneNormal().toArray()).toEqual([0, 0, 1]);
    expect(polygon.getPlaneConstant()).toBeCloseTo(0, 9);
  });

  it('keeps and blends per-corner texture coordinates through a cut', () => {
    const ops = new CsgBooleanOps();
    const result = ops.operatePolygons(
      box(2, new THREE.Vector3()),
      box(2, new THREE.Vector3(1, 0, 0)),
      CsgOperation.SUBTRACT,
    );
    const front = result.find((polygon) => polygon.getPlaneNormal().z > 0.99);
    const uvs = front?.getUvs();
    expect(uvs).toHaveLength(4);
    const corner = front?.getVertices().findIndex((vertex) => vertex.x === 0 && vertex.y === -1);
    expect(uvs?.[corner ?? -1]).toEqual([0.5, 0]);
  });

  it('drops pieces with no area', () => {
    const ops = new CsgBooleanOps();
    const result = ops.operatePolygons(
      box(2, new THREE.Vector3()),
      box(1, new THREE.Vector3(1, 1, 1)),
      CsgOperation.SUBTRACT,
    );
    expect(result.every((polygon) => polygon.getPlaneNormal().lengthSq() > 0.99)).toBe(true);
  });
});
