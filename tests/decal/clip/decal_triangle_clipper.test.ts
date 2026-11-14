import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DecalTriangleClipper } from '@/decal/clip/decal_triangle_clipper.js';
import { DecalClipPolygon } from '@/decal/clip/decal_clip_polygon.js';

/**
 * Returns positions and upward normals for triangles given as corner lists.
 *
 * @param triangles Triangles as three [x, y, z] corners each.
 * @returns Position and normal arrays.
 */
function trianglesOf(triangles: number[][][]): { positions: Float32Array; normals: Float32Array } {
  const positions = new Float32Array(triangles.flat(2));
  const normals = new Float32Array(positions.length);
  for (let index = 1; index < normals.length; index += 3) normals[index] = 1;
  return { positions, normals };
}

/**
 * Returns the area of the clipped polygon from its model positions.
 *
 * @param clipper Clipper holding a result.
 * @param cornerCount Corner count.
 * @returns Polygon area.
 */
function clippedArea(clipper: DecalTriangleClipper, cornerCount: number): number {
  const data = clipper.result().cornerData();
  const corner = (index: number) =>
    new THREE.Vector3(
      data[index * DecalClipPolygon.floatsPerCorner + 3],
      data[index * DecalClipPolygon.floatsPerCorner + 4],
      data[index * DecalClipPolygon.floatsPerCorner + 5],
    );
  let area = 0;
  for (let index = 1; index + 1 < cornerCount; index++) {
    area +=
      corner(index)
        .sub(corner(0))
        .cross(corner(index + 1).sub(corner(0)))
        .length() / 2;
  }
  return area;
}

/**
 * Returns a clipper for a projector box of the given size centred at origin.
 *
 * @param size Projector box size.
 * @returns Clipper.
 */
function clipperForBox(size: THREE.Vector3): DecalTriangleClipper {
  const clipper = new DecalTriangleClipper();
  clipper.projectorSpaceSet(new THREE.Matrix4().makeScale(size.x, size.y, size.z).invert());
  return clipper;
}

describe('DecalTriangleClipper', () => {
  it('keeps a triangle inside the box whole and drops one outside', () => {
    const clipper = clipperForBox(new THREE.Vector3(4, 4, 4));
    const inside = trianglesOf([
      [
        [0, 0, 0],
        [1, 0, 0],
        [0, 0, 1],
      ],
    ]);
    expect(clipper.clipTriangle(inside.positions, inside.normals, 0)).toBe(3);
    const outside = trianglesOf([
      [
        [5, 0, 0],
        [6, 0, 0],
        [5, 0, 1],
      ],
    ]);
    expect(clipper.clipTriangle(outside.positions, outside.normals, 0)).toBe(0);
  });

  it('cuts a large triangle to exactly the part inside the box', () => {
    const clipper = clipperForBox(new THREE.Vector3(2, 2, 2));
    const large = trianglesOf([
      [
        [-10, 0, -10],
        [30, 0, -10],
        [-10, 0, 30],
      ],
    ]);
    const cornerCount = clipper.clipTriangle(large.positions, large.normals, 0);
    expect(cornerCount).toBe(4);
    expect(clippedArea(clipper, cornerCount)).toBeCloseTo(4, 6);
  });

  it('cuts a shared edge at the same point from both of its triangles', () => {
    const clipper = clipperForBox(new THREE.Vector3(1, 1, 1));
    const pair = trianglesOf([
      [
        [-3, 0, -0.2],
        [3, 0, 0.1],
        [0, 0, 3],
      ],
      [
        [3, 0, 0.1],
        [-3, 0, -0.2],
        [0, 0, -3],
      ],
    ]);
    const collect = (triangle: number) => {
      const count = clipper.clipTriangle(pair.positions, pair.normals, triangle);
      const data = clipper.result().cornerData();
      return Array.from({ length: count }, (_, index) =>
        [3, 4, 5].map((offset) => data[index * DecalClipPolygon.floatsPerCorner + offset]).join(','),
      );
    };
    const first = new Set(collect(0));
    const shared = collect(1).filter((corner) => first.has(corner));
    expect(shared.length).toBe(2);
  });
});
