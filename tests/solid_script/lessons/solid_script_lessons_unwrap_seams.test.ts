import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Unwraps a cube of size 2 and reads each face's corner UVs.
 *
 * @param seams Seams field.
 * @returns UVs per face, as U, V pairs.
 */
function unwrap(seams: string): number[][][] {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([
      { command: 'cube', values: { size: '2', into: 'C' } },
      { command: 'select_faces', values: { which: 'All', of: '[C]' } },
      { command: 'unwrap', values: { seams } },
      { command: 'for_each', values: { variable: 'F', list: '[C.Faces]' } },
      { command: 'echo', values: { value: '[F.UVs]' } },
      { command: 'end' },
    ]),
  );
  expect(result.error?.message).toBeUndefined();
  return result.messages.map((text) => (JSON.parse(text) as number[][]).map(([u = 0, v = 0]) => [u, v]));
}

/**
 * Keys of every UV corner, rounded.
 *
 * @param faces UVs per face.
 * @returns Distinct keys.
 */
function distinct(faces: number[][][]): Set<string> {
  return new Set(faces.flat().map(([u = 0, v = 0]) => `${u.toFixed(4)},${v.toFixed(4)}`));
}

describe('Unwrap Seams', () => {
  it('lays each face alone without Seams', () => {
    const faces = unwrap('');
    expect(faces).toHaveLength(6);
    faces.flat().forEach(([u = 0, v = 0]) => expect(Math.max(u, v)).toBeLessThanOrEqual(2 + 1e-9));
  });

  it('keeps faces joined along edges that are not seams, each face true to size', () => {
    const faces = unwrap('[=[$Edge.Angle] > 100]');
    expect(faces).toHaveLength(6);
    expect(distinct(faces).size).toBeLessThan(24);
    for (const face of faces)
      face.forEach(([u = 0, v = 0], index) => {
        const [nu = 0, nv = 0] = face[(index + 1) % face.length] ?? [];
        expect(Math.hypot(nu - u, nv - v)).toBeCloseTo(2, 6);
      });
  });
});
