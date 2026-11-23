import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptShapeMeshes, type SolidScriptShapeMesh } from '@/solid_script/language/solid_script_mesh.js';

/**
 * Runs Fill Points and gives the one mesh it builds, or the error.
 *
 * @param values Fill Points values.
 * @returns Mesh or error message.
 */
function fill(values: Record<string, string>): SolidScriptShapeMesh | string {
  const result = solidScriptProgramRun(solidScriptDocumentCreate([{ command: 'fill_points', values }]));
  if (result.error) return result.error.message;
  const [mesh] = solidScriptShapeMeshes(result.shapes);
  return mesh ?? 'no mesh';
}

/**
 * Corners of every face of a mesh.
 *
 * @param mesh Mesh.
 * @returns Triangles of points.
 */
function triangles(mesh: SolidScriptShapeMesh): THREE.Vector3[][] {
  return mesh.faces.map((face) => face.map((corner) => mesh.points[corner] ?? new THREE.Vector3()));
}

/**
 * Whether a point lies strictly inside the circle through a triangle, seen from
 * above.
 *
 * @param triangle Three corners.
 * @param point Point.
 * @returns True inside.
 */
function inCircle([a, b, c]: THREE.Vector3[], point: THREE.Vector3): boolean {
  const rows = [a, b, c].map((corner = new THREE.Vector3()) => {
    const x = corner.x - point.x;
    const z = corner.z - point.z;
    return [x, z, x * x + z * z] as const;
  });
  const [[ax, az, aw], [bx, bz, bw], [cx, cz, cw]] = rows as [
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number],
  ];
  const det = ax * (bz * cw - bw * cz) - az * (bx * cw - bw * cx) + aw * (bx * cz - bz * cx);
  const turn = (b!.x - a!.x) * (c!.z - a!.z) - (b!.z - a!.z) * (c!.x - a!.x);
  return det * Math.sign(turn) > 1e-9;
}

describe('Fill Points', () => {
  it('fills loose points with triangles facing Normal', () => {
    const mesh = fill({ points: '[0, 0, 0], [2, 0, 0], [2, 0, 2], [0, 0, 2], [1, 0, 1]' });
    if (typeof mesh === 'string') throw new Error(mesh);
    expect(mesh.points).toHaveLength(5);
    expect(mesh.faces).toHaveLength(4);
    for (const [a, b, c] of triangles(mesh)) {
      const normal = b!.clone().sub(a!).cross(c!.clone().sub(a!));
      expect(normal.y).toBeGreaterThan(0);
    }
    const area = triangles(mesh).reduce(
      (sum, [a, b, c]) => sum + b!.clone().sub(a!).cross(c!.clone().sub(a!)).length() / 2,
      0,
    );
    expect(area).toBeCloseTo(4);
  });

  it('keeps every circle through a triangle free of other points', () => {
    const points = [
      [0, 0, 0],
      [3, 0, 0.2],
      [5, 0, 1],
      [6, 0, 4],
      [4, 0, 6],
      [1, 0, 5],
      [-1, 0, 3],
      [2, 0, 2],
      [3, 0, 3.5],
      [1.5, 0, 3.2],
      [4.2, 0, 2.4],
      [2.6, 0, 4.8],
    ];
    const mesh = fill({ points: points.map((point) => `[${point.join(', ')}]`).join(', ') });
    if (typeof mesh === 'string') throw new Error(mesh);
    expect(mesh.points).toHaveLength(points.length);
    for (const triangle of triangles(mesh))
      for (const point of mesh.points) expect(inCircle(triangle, point)).toBe(false);
  });

  it('keeps points on the edge of the hull and drops repeated points', () => {
    const mesh = fill({ points: '[0, 0, 0], [1, 0, 0], [2, 0, 0], [2, 0, 2], [0, 0, 2], [2, 0, 2]' });
    if (typeof mesh === 'string') throw new Error(mesh);
    expect(mesh.points).toHaveLength(5);
    expect(mesh.faces).toHaveLength(3);
  });

  it('lays the points flat on the plane facing Normal', () => {
    const mesh = fill({ points: '[0, 0, 0], [2, 0, 0], [0, 2, 0]', normal: '0, 0, 1' });
    if (typeof mesh === 'string') throw new Error(mesh);
    const [[a, b, c] = []] = triangles(mesh);
    expect(b!.clone().sub(a!).cross(c!.clone().sub(a!)).z).toBeGreaterThan(0);
  });

  it('needs at least 3 points that are not in one line', () => {
    expect(fill({ points: '[0, 0, 0], [1, 0, 0], [2, 0, 0]' })).toContain('not all in one line');
  });

  it('fills every group of points on its own with Groups, one per point', () => {
    const points = '[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1], [3, 0, 0], [4, 0, 0], [4, 0, 1], [3, 0, 1]';
    const mesh = fill({ points, groups: '[=List(0, 0, 0, 0, 1, 1, 1, 1)]' });
    if (typeof mesh === 'string') throw new Error(mesh);
    expect(mesh.points).toHaveLength(8);
    expect(mesh.faces).toHaveLength(4);
    for (const face of mesh.faces)
      expect(new Set(face.map((corner) => (mesh.points[corner]!.x > 2 ? 1 : 0))).size).toBe(1);
    expect(fill({ points, groups: '[=List(0, 1)]' })).toContain('one Group per point');
  });

  it('leaves out a group too small to fill', () => {
    const mesh = fill({ points: '[0, 0, 0], [1, 0, 0], [1, 0, 1], [5, 0, 5]', groups: '[=List(0, 0, 0, 1)]' });
    if (typeof mesh === 'string') throw new Error(mesh);
    expect(mesh.faces).toHaveLength(1);
  });
});
