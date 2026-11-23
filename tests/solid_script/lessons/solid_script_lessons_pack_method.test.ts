import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Unwraps a cube of size 2, packs it, and reads each face's corner UVs.
 *
 * @param pack Pack Islands values.
 * @returns Error message, if any, and UVs per face.
 */
function packed(pack: Record<string, string>): { error: string | undefined; faces: number[][][] } {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([
      { command: 'cube', values: { size: '2', into: 'C' } },
      { command: 'select_faces', values: { which: 'All', of: '[C]' } },
      { command: 'unwrap', values: { seams: '[=[$Edge.Angle] > 45]' } },
      { command: 'pack_islands', values: pack },
      { command: 'for_each', values: { variable: 'F', list: '[C.Faces]' } },
      { command: 'echo', values: { value: '[F.UVs]' } },
      { command: 'end' },
    ]),
  );
  const faces = result.messages.map((text) => (JSON.parse(text) as number[][]).map(([u = 0, v = 0]) => [u, v]));
  return { error: result.error?.message, faces };
}

/**
 * Bounds of a face's UVs.
 *
 * @param face Corner UVs.
 * @returns Lowest and highest U and V.
 */
function bounds(face: number[][]): number[] {
  const us = face.map(([u = 0]) => u);
  const vs = face.map(([, v = 0]) => v);
  return [Math.min(...us), Math.min(...vs), Math.max(...us), Math.max(...vs)];
}

describe('Pack Islands Method', () => {
  it.each(['Convex Hull', 'Exact Shape'])('packs six faces apart inside the square by %s', (method) => {
    const { error, faces } = packed({ method });
    expect(error).toBeUndefined();
    expect(faces).toHaveLength(6);
    const boxes = faces.map(bounds);
    boxes.forEach(([u0 = 0, v0 = 0, u1 = 0, v1 = 0], at) => {
      expect(Math.min(u0, v0)).toBeGreaterThanOrEqual(-1e-9);
      expect(Math.max(u1, v1)).toBeLessThanOrEqual(1 + 1e-9);
      expect(u1 - u0).toBeGreaterThan(0.2);
      boxes
        .slice(at + 1)
        .forEach(([a0 = 0, b0 = 0, a1 = 0, b1 = 0]) =>
          expect(Math.min(u1, a1) - Math.max(u0, a0) < 1e-6 || Math.min(v1, b1) - Math.max(v0, b0) < 1e-6).toBe(true),
        );
    });
  });

  it('stops on an unknown Method', () => {
    expect(packed({ method: 'Wobbly' }).error).toContain(
      'Pack Islands needs Bounding Box, Convex Hull or Exact Shape in Method, not Wobbly',
    );
  });
});
