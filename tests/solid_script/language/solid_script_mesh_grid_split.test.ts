import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { SolidCompiledPolygon } from '@/solid/algorithm/compile/solid_compiled_polygon.js';
import { SurfaceCategory } from '@/solid/types/surface_category.js';
import { solidScriptMeshGridSplit } from '@/solid_script/language/solid_script_mesh_grid_split.js';

/**
 * Builds a compiled polygon facing up from corner points on the ground plane.
 *
 * @param corners X and Z pairs in counter-clockwise order seen from above.
 * @returns Polygon.
 */
function groundPolygon(corners: readonly (readonly [number, number])[]): SolidCompiledPolygon {
  return {
    vertices: corners.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    normal: new THREE.Vector3(0, 1, 0),
    surfaceIndex: 3,
    brushId: 'ground',
    textureId: '',
    category: Object.values(SurfaceCategory)[0] as SurfaceCategory,
  };
}

/**
 * Area of a flat convex polygon.
 *
 * @param vertices Corners.
 * @returns Area.
 */
function area(vertices: readonly THREE.Vector3[]): number {
  const sum = new THREE.Vector3();
  for (let index = 1; index + 1 < vertices.length; index++)
    sum.add(
      vertices[index]!.clone()
        .sub(vertices[0]!)
        .cross(vertices[index + 1]!.clone().sub(vertices[0]!)),
    );
  return sum.length() / 2;
}

describe('SolidScript mesh grid split', () => {
  it('splits a rectangle with extra corners on two sides into a grid of cells through every extra corner', () => {
    const width = 4;
    const depth = 2;
    const polygon = groundPolygon([
      [0, 0],
      [0, depth],
      [width / 4, depth],
      [width, depth],
      [width, 0],
      [width / 2, 0],
    ]);
    const cells = solidScriptMeshGridSplit(polygon);
    if (!cells) throw new Error('Expected cells');
    expect(cells).toHaveLength(3);
    expect(
      cells.every((cell) => cell.vertices.length === 4 && cell.brushId === 'ground' && cell.surfaceIndex === 3),
    ).toBe(true);
    expect(cells.reduce((sum, cell) => sum + area(cell.vertices), 0)).toBeCloseTo(width * depth, 9);
    for (const vertex of polygon.vertices)
      expect(cells.some((cell) => cell.vertices.some((corner) => corner.distanceTo(vertex) < 1e-9))).toBe(true);
  });

  it('makes rows and columns when extra corners sit on sides running both ways', () => {
    const polygon = groundPolygon([
      [0, 0],
      [0, 1],
      [0, 3],
      [3, 3],
      [3, 0],
      [2, 0],
    ]);
    const cells = solidScriptMeshGridSplit(polygon);
    expect(cells).toHaveLength(4);
    expect(cells?.reduce((sum, cell) => sum + area(cell.vertices), 0)).toBeCloseTo(9, 9);
  });

  it('leaves plain quads and polygons with other than four real corners alone', () => {
    expect(
      solidScriptMeshGridSplit(
        groundPolygon([
          [0, 0],
          [0, 1],
          [1, 1],
          [1, 0],
        ]),
      ),
    ).toBeNull();
    expect(
      solidScriptMeshGridSplit(
        groundPolygon([
          [0, 0],
          [0, 2],
          [1, 2],
          [2, 2],
          [2, 0],
        ]),
      ),
    ).not.toBeNull();
    expect(
      solidScriptMeshGridSplit(
        groundPolygon([
          [0, 0],
          [0, 2],
          [1, 2.5],
          [2, 2],
          [2, 0],
        ]),
      ),
    ).toBeNull();
    expect(
      solidScriptMeshGridSplit(
        groundPolygon([
          [0, 0],
          [0, 2],
          [1, 1],
          [2, 0],
        ]),
      ),
    ).toBeNull();
  });
});
