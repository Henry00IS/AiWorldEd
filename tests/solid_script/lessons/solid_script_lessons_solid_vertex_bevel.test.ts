import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptGeometryLeaves } from '@/solid_script/language/solid_script_geometry.js';

/**
 * Runs a cube of the given size, picks it and bevels its corners.
 *
 * @param size Cube size.
 * @param bevel Values of the Bevel Vertices line.
 * @param extra Lines between the cube and the bevel.
 * @returns The solid's corners and faces, or the error.
 */
function bevelled(
  size: string,
  bevel: Record<string, string>,
  extra: SolidScriptLine[] = [],
): { points: THREE.Vector3[]; faces: number[][]; kind: string; faceTags: number } | string {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([
      { command: 'cube', values: { size, anchor: 'Center, Center, Center', into: 'Window' } },
      ...extra,
      { command: 'bevel_vertices', values: bevel },
      { command: 'output', values: { of: '[Window]' } },
    ]),
  );
  if (result.error) return result.error.message;
  const leaf = solidScriptGeometryLeaves(result.shapes)[0];
  if (leaf === undefined) return 'no solid';
  return { points: leaf.points, faces: leaf.faces, kind: leaf.kind, faceTags: leaf.faceTags?.length ?? 0 };
}

/**
 * Volume enclosed by outward faces.
 *
 * @param body Corners and faces.
 * @returns Volume.
 */
function volume(body: { points: THREE.Vector3[]; faces: number[][] }): number {
  return Math.abs(
    body.faces.reduce((total, loop) => {
      const first = body.points[loop[0] ?? 0]!;
      let sum = 0;
      for (let index = 1; index + 1 < loop.length; index++)
        sum += first.dot(body.points[loop[index]!]!.clone().cross(body.points[loop[index + 1]!]!)) / 6;
      return total + sum;
    }, 0),
  );
}

describe('Bevel Vertices on a solid', () => {
  it('cuts each corner of a box off flat and stays a solid', () => {
    const body = bevelled('2, 1, 1', { distance: '0.2', of: '[Window]' });
    if (typeof body === 'string') throw new Error(body);
    expect(body.kind).toBe('solid');
    expect(body.faces).toHaveLength(14);
    expect(volume(body)).toBeCloseTo(2 - (8 * 0.2 ** 3) / 6, 5);
  });

  it('cuts only the picked corners and tags the new faces', () => {
    const body = bevelled('2, 2, 2', { distance: '0.5', where: '[=[$Vertex.Position.Y] > 0]', of: '[Window]' });
    if (typeof body === 'string') throw new Error(body);
    expect(body.faces).toHaveLength(10);
    expect(body.faceTags).toBe(4);
    expect(volume(body)).toBeCloseTo(8 - (4 * 0.5 ** 3) / 6, 5);
  });

  it('works from the selected vertices', () => {
    const body = bevelled('2, 2, 2', { distance: '0.3' }, [
      { command: 'select_objects', values: { of: '[Window]' } },
      {
        command: 'select_vertices',
        values: { where: '[=[$Vertex.Position.X] > 0 and [$Vertex.Position.Y] > 0 and [$Vertex.Position.Z] > 0]' },
      },
    ]);
    if (typeof body === 'string') throw new Error(body);
    expect(body.faces).toHaveLength(7);
  });

  it('stops when Distance reaches past an edge', () => {
    expect(bevelled('2, 1, 1', { distance: '1.5', of: '[Window]' })).toContain('too long');
  });
});
