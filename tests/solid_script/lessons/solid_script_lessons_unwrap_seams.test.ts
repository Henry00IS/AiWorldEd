import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Unwraps a cube of size 2 and reads each face's corner UVs.
 *
 * @param values Unwrap values; Pack No leaves the islands where they fold.
 * @param pack Pack Islands values for a line after it, or null for none.
 * @returns UVs per face, as U, V pairs.
 */
function unwrap(values: Record<string, string>, pack: Record<string, string> | null = null): number[][][] {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([
      { command: 'cube', values: { size: '2', into: 'C' } },
      { command: 'select_faces', values: { which: 'All', of: '[C]' } },
      { command: 'unwrap', values },
      ...(pack ? [{ command: 'pack_islands', values: pack }] : []),
      { command: 'for_each', values: { variable: 'F', list: '[C.Faces]' } },
      { command: 'echo', values: { value: '[F.UVs]' } },
      { command: 'end' },
    ]),
  );
  expect(result.error?.message).toBeUndefined();
  return result.messages.map((text) => (JSON.parse(text) as number[][]).map(([u = 0, v = 0]) => [u, v]));
}

/** Seams that cut a cube's every edge but keep nothing joined at a right angle. */
const SEAMS = '[=[$Edge.Angle] > 100]';

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
  it('lays each face alone without Seams, true to size and a whole number of repeats apart', () => {
    const faces = unwrap({ pack: 'No' });
    expect(faces).toHaveLength(6);
    for (const face of faces) {
      const us = face.map(([u = 0]) => u);
      const vs = face.map(([, v = 0]) => v);
      expect(Math.max(...us) - Math.min(...us)).toBeCloseTo(2, 6);
      expect(Math.max(...vs) - Math.min(...vs)).toBeCloseTo(2, 6);
      expect(Math.min(...us) % 1).toBeCloseTo(0, 6);
    }
  });

  it('keeps faces joined along edges that are not seams, each face true to size', () => {
    const faces = unwrap({ seams: SEAMS, pack: 'No' });
    expect(faces).toHaveLength(6);
    expect(distinct(faces).size).toBeLessThan(24);
    for (const face of faces)
      face.forEach(([u = 0, v = 0], index) => {
        const [nu = 0, nv = 0] = face[(index + 1) % face.length] ?? [];
        expect(Math.hypot(nu - u, nv - v)).toBeCloseTo(2, 6);
      });
  });

  it('packs faces joined by Unwrap as one island, keeping their shared corners shared', () => {
    const packed = unwrap({ seams: SEAMS, pack: 'No' }, {});
    expect(distinct(packed).size).toBe(distinct(unwrap({ seams: SEAMS, pack: 'No' })).size);
    packed.flat().forEach((uv) => uv.forEach((value) => expect(value).toBeLessThanOrEqual(1 + 1e-9)));
  });

  it('leaves Margin of the square between islands, so a wider Margin packs them smaller', () => {
    const width = (margin: string): number => {
      const [first = [], second = []] = unwrap({ pack: 'No' }, { margin })[0] ?? [];
      const [u0 = 0] = first;
      const [u1 = 0] = second;
      return Math.abs(u1 - u0);
    };
    expect(width('0.2')).toBeLessThan(width('0'));
  });

  it('packs into 0 to 1 by default, as Pack Islands after it would', () => {
    const packed = unwrap({ seams: SEAMS });
    expect(packed).toEqual(unwrap({ seams: SEAMS, pack: 'No' }, {}));
    packed.flat().forEach((uv) => uv.forEach((value) => expect(value).toBeLessThanOrEqual(1 + 1e-9)));
  });

  it('packs with its own Margin', () => {
    expect(unwrap({ margin: '0.2' })).toEqual(unwrap({ pack: 'No' }, { margin: '0.2' }));
  });

  it.each([{}, { seams: '[=[$Edge.Angle] > 45]' }])(
    'packs every face of a cube apart, never two on one spot (%o)',
    (values) => {
      const boxes = unwrap(values).map((face) => {
        const us = face.map(([u = 0]) => u);
        const vs = face.map(([, v = 0]) => v);
        return [Math.min(...us), Math.min(...vs), Math.max(...us), Math.max(...vs)];
      });
      boxes.forEach(([u0 = 0, v0 = 0, u1 = 0, v1 = 0], at) =>
        boxes
          .slice(at + 1)
          .forEach(([a0 = 0, b0 = 0, a1 = 0, b1 = 0]) =>
            expect(Math.min(u1, a1) - Math.max(u0, a0) < 1e-6 || Math.min(v1, b1) - Math.max(v0, b0) < 1e-6).toBe(true),
          ),
      );
    },
  );

  it('stops on a Pack that is not Yes or No', () => {
    const result = solidScriptProgramRun(
      solidScriptDocumentCreate([
        { command: 'cube', values: { into: 'C' } },
        { command: 'select_faces', values: { which: 'All', of: '[C]' } },
        { command: 'unwrap', values: { pack: '"maybe"' } },
      ]),
    );
    expect(result.error?.message).toContain('Pack');
  });
});
