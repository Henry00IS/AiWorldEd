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

  it('turns a tilted island square to the axes when Rotate is on, and leaves it tilted when off', () => {
    const diamond: [number, number][] = [
      [1, 0],
      [2, 1],
      [1, 2],
      [0, 1],
    ];
    const rounded = (island: [number, number][] | undefined) =>
      (island ?? []).map(([u, v]) => `${Math.round(u * 1e4) / 1e4 + 0},${Math.round(v * 1e4) / 1e4 + 0}`).sort();
    expect(rounded(textureUvPackIslands([diamond], 0, true)[0])).toEqual(['0,0', '0,1', '1,0', '1,1']);
    expect(rounded(textureUvPackIslands([diamond], 0)[0])).toEqual(['0,0.5', '0.5,0', '0.5,1', '1,0.5']);
  });

  it('turns a long tilted island along its length so it fills more of the square', () => {
    const angle = Math.PI / 6;
    const strip: [number, number][] = [
      [0, 0],
      [4, 0],
      [4, 1],
      [0, 1],
    ].map(([u = 0, v = 0]) => [u * Math.cos(angle) - v * Math.sin(angle), u * Math.sin(angle) + v * Math.cos(angle)]);
    const area = (island: [number, number][] | undefined) => {
      const us = (island ?? []).map(([u]) => u);
      const vs = (island ?? []).map(([, v]) => v);
      return (Math.max(...us) - Math.min(...us)) * (Math.max(...vs) - Math.min(...vs));
    };
    expect(area(textureUvPackIslands([strip], 0, true)[0])).toBeCloseTo(0.25, 6);
  });
});
