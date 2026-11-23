import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptFillPoints } from '@/solid_script/language/solid_script_fill_points.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * A 4 by 4 square on the ground with two points near the middle of its bottom
 * and top sides.
 */
const SQUARE = [
  [0, 0, 0],
  [4, 0, 0],
  [4, 0, 4],
  [0, 0, 4],
  [2, 0, 0.2],
  [2, 0, 3.8],
].map(([x = 0, y = 0, z = 0]) => new THREE.Vector3(x, y, z));

/**
 * Fills points and lists the mesh's edges.
 *
 * @param points Points.
 * @param edges Kept edges.
 * @param regions True for Regions.
 * @returns Faces and edge keys.
 */
function fill(points: THREE.Vector3[], edges: [number, number][], regions = false) {
  const mesh = solidScriptFillPoints(points, new THREE.Vector3(0, 1, 0), 'Fill Points', {
    groups: null,
    edges,
    regions,
  });
  const keys = new Set(
    mesh.faces.flatMap((face) => face.map((a, at) => [a, face[(at + 1) % face.length]!].sort().join('-'))),
  );
  const area = mesh.faces.reduce((sum, face) => {
    const flat = face.map((index) => new THREE.Vector2(mesh.points[index]!.x, mesh.points[index]!.z));
    return sum + Math.abs(THREE.ShapeUtils.area(flat));
  }, 0);
  return { faces: mesh.faces, keys, area };
}

describe('Fill Points Edges', () => {
  it('keeps an edge the empty-circle rule would cut, through the triangles in its way', () => {
    expect(fill(SQUARE, []).keys.has('0-2')).toBe(false);
    const kept = fill(SQUARE, [[0, 2]]);
    expect(kept.keys.has('0-2')).toBe(true);
    expect(kept.area).toBeCloseTo(16, 9);
  });

  it('keeps an edge through another point as two edges meeting there', () => {
    const points = [...SQUARE.slice(0, 4), new THREE.Vector3(2, 0, 2)];
    const { keys } = fill(points, [[0, 2]]);
    expect(keys.has('0-4') && keys.has('2-4')).toBe(true);
  });

  it('joins the triangles between kept edges and the border into one face each with Regions', () => {
    const points = [...SQUARE.slice(0, 4), new THREE.Vector3(2, 0, 2)];
    const { faces, area } = fill(points, [[0, 2]], true);
    expect(faces).toHaveLength(2);
    expect(area).toBeCloseTo(16, 9);
  });

  it('stops on edges that cross each other', () => {
    expect(() =>
      fill(SQUARE.slice(0, 4), [
        [0, 2],
        [1, 3],
      ]),
    ).toThrow('Fill Points needs Edges that do not cross each other');
  });

  it.each([
    [{ edges: '[=List(List(0, 9))]' }, 'Fill Points needs Edges of two point numbers from 0 to 4'],
    [{ faces: 'Blobs' }, 'Fill Points needs Triangles or Regions in Faces, not Blobs'],
  ])('stops on bad values (%o)', (values, message) => {
    const result = solidScriptProgramRun(solidScriptDocumentCreate([{ command: 'fill_points', values }]));
    expect(result.error?.message).toContain(message);
  });
});
