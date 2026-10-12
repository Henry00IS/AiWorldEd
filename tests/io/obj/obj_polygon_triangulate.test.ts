import { describe, it, expect } from 'vitest';
import { triangulateSimplePolygon3d } from '@/mesh/convert/mesh_polygon_triangulate.js';
import { ObjImporter } from '@/io/obj/obj_importer.js';
import { hierarchyNameAllocator } from '@/utils/utils_hierarchy_name_allocator.js';

describe('triangulateSimplePolygon3d', () => {
  it('returns a single triangle for three corners', () => {
    const triangles = triangulateSimplePolygon3d([
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
    ]);
    expect(triangles).toEqual([0, 1, 2]);
  });

  it('preserves input winding for a CW triangle', () => {
    const triangles = triangulateSimplePolygon3d([
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 1, y: 0, z: 0 },
    ]);
    expect(triangles).toEqual([0, 1, 2]);
  });

  it('preserves input winding for a CW quad', () => {
    const points = [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 1, y: 1, z: 0 },
      { x: 1, y: 0, z: 0 },
    ];
    const triangles = triangulateSimplePolygon3d(points);
    expect(triangles.length).toBe(6);
    for (let index = 0; index < triangles.length; index += 3) {
      const a = points[triangles[index]!]!;
      const b = points[triangles[index + 1]!]!;
      const c = points[triangles[index + 2]!]!;
      // Original loop is CW about +Z, so triangle cross z should be negative.
      const crossZ = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      expect(crossZ).toBeLessThan(0);
    }
  });

  it('triangulates a folded hexagon whose edges are parallel to a world axis', () => {
    const half = 1;
    const raised = -0.3;
    const points = [
      { x: half, y: -half, z: -half },
      { x: half, y: -half, z: half },
      { x: -half, y: -half, z: half },
      { x: -half, y: -half, z: -half },
      { x: -half, y: raised, z: -half },
      { x: half, y: raised, z: -half },
    ];
    const triangles = triangulateSimplePolygon3d(points);
    expect(triangles.length / 3).toBe(points.length - 2);
    for (let index = 0; index < triangles.length; index += 3) {
      const a = points[triangles[index] ?? 0];
      const b = points[triangles[index + 1] ?? 0];
      const c = points[triangles[index + 2] ?? 0];
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      expect(c).toBeDefined();
      if (!a || !b || !c) {
        continue;
      }
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const abz = b.z - a.z;
      const acx = c.x - a.x;
      const acy = c.y - a.y;
      const acz = c.z - a.z;
      const area = (aby * acz - abz * acy) ** 2 + (abz * acx - abx * acz) ** 2 + (abx * acy - aby * acx) ** 2;
      expect(area).toBeGreaterThan(1e-8);
    }
  });

  it('does not cover the concave notch when ear-clipping a concave n-gon', () => {
    // C-shaped polygon: fan from first vertex would fill the open mouth.
    const points = [
      { x: 0, y: 0, z: 0 },
      { x: 3, y: 0, z: 0 },
      { x: 3, y: 1, z: 0 },
      { x: 1, y: 1, z: 0 },
      { x: 1, y: 2, z: 0 },
      { x: 3, y: 2, z: 0 },
      { x: 3, y: 3, z: 0 },
      { x: 0, y: 3, z: 0 },
    ];
    const triangles = triangulateSimplePolygon3d(points);
    expect(triangles.length % 3).toBe(0);
    expect(triangles.length / 3).toBe(points.length - 2);
    // Sample a point inside the concave mouth (should not be covered).
    const mouth = { x: 2, y: 1.5, z: 0 };
    expect(isPointCoveredByTriangles(mouth, points, triangles)).toBe(false);
    // Sample a point on the solid arm (should be covered).
    const arm = { x: 0.5, y: 1.5, z: 0 };
    expect(isPointCoveredByTriangles(arm, points, triangles)).toBe(true);
  });

  it('does not fill the reflex pocket of a concave quad', () => {
    const points = [
      { x: 0, y: 0, z: 0 },
      { x: 3, y: 0, z: 0 },
      { x: 1, y: 1, z: 0 },
      { x: 3, y: 2, z: 0 },
    ];
    const triangles = triangulateSimplePolygon3d(points);
    expect(triangles.length / 3).toBe(2);
    const pocket = { x: 2, y: 1, z: 0 };
    expect(isPointCoveredByTriangles(pocket, points, triangles)).toBe(false);
  });
});

describe('ObjImporter concave faces', () => {
  it('imports a concave n-gon as one face and display-triangulates without filling the notch', () => {
    hierarchyNameAllocator.reset();
    const source = `
v 0 0 0
v 3 0 0
v 3 1 0
v 1 1 0
v 1 2 0
v 3 2 0
v 3 3 0
v 0 3 0
o Concave
f 1 2 3 4 5 6 7 8
`;
    const result = new ObjImporter().importFromText(source, 'concave.obj');
    expect(result.meshes).toHaveLength(1);
    const mesh = result.meshes[0]!;
    const document = mesh.userData['meshDocument'] as { getTopology: () => { getFaceCount: () => number } };
    expect(document.getTopology().getFaceCount()).toBe(1);
    const index = mesh.geometry.getIndex();
    expect(index).not.toBeNull();
    // 8-gon → 6 display triangles → 18 indices
    expect(index!.count).toBe(18);
  });
});

/**
 * Returns whether a 2D point (z ignored) is covered by any triangulated
 * triangle.
 *
 * @param point Query point.
 * @param points Polygon corners.
 * @param triangles Flat triples of indices.
 * @returns True when covered.
 */
function isPointCoveredByTriangles(
  point: { x: number; y: number; z: number },
  points: ReadonlyArray<{ x: number; y: number; z: number }>,
  triangles: readonly number[],
): boolean {
  for (let index = 0; index < triangles.length; index += 3) {
    const a = points[triangles[index]!]!;
    const b = points[triangles[index + 1]!]!;
    const c = points[triangles[index + 2]!]!;
    if (pointInTriangle2d(point, a, b, c)) {
      return true;
    }
  }
  return false;
}

/**
 * Inclusive 2D point-in-triangle test.
 *
 * @param point Query.
 * @param a Corner.
 * @param b Corner.
 * @param c Corner.
 * @returns True when inside.
 */
function pointInTriangle2d(
  point: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
): boolean {
  const c1 = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
  const c2 = (c.x - b.x) * (point.y - b.y) - (c.y - b.y) * (point.x - b.x);
  const c3 = (a.x - c.x) * (point.y - c.y) - (a.y - c.y) * (point.x - c.x);
  const hasNeg = c1 < -1e-9 || c2 < -1e-9 || c3 < -1e-9;
  const hasPos = c1 > 1e-9 || c2 > 1e-9 || c3 > 1e-9;
  return !(hasNeg && hasPos);
}
