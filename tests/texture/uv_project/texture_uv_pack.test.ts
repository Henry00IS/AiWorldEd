import { describe, expect, it } from 'vitest';
import { textureUvPackIslands } from '@/texture/uv_project/texture_uv_pack.js';

describe('textureUvPackIslands', () => {
  it('fits two square islands in the 0–1 square without overlap', () => {
    const packed = textureUvPackIslands([
      [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
      ],
      [
        [10, 10],
        [11, 10],
        [11, 11],
        [10, 11],
      ],
    ]);
    expect(packed).toHaveLength(2);
    const all = packed.flat();
    expect(Math.min(...all.map(([u]) => u))).toBeGreaterThanOrEqual(-1e-9);
    expect(Math.min(...all.map(([, v]) => v))).toBeGreaterThanOrEqual(-1e-9);
    expect(Math.max(...all.map(([u]) => u))).toBeLessThanOrEqual(1 + 1e-9);
    expect(Math.max(...all.map(([, v]) => v))).toBeLessThanOrEqual(1 + 1e-9);
    const [first, second] = packed;
    if (!first || !second) throw new Error('Expected two islands');
    const mid = (island: [number, number][]): [number, number] => {
      const u = island.reduce((sum, point) => sum + point[0], 0) / island.length;
      const v = island.reduce((sum, point) => sum + point[1], 0) / island.length;
      return [u, v];
    };
    const a = mid(first);
    const b = mid(second);
    expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeGreaterThan(0.1);
  });
});
