import { describe, expect, it } from 'vitest';
import {
  PAINT_BLEND_MODES,
  type PaintBlendMode,
  paintAffineApply,
  paintAffineCompose,
  paintBlendAffine,
  paintBlendModeParse,
} from '@/paint/raster/paint_blend_mode.js';

/**
 * Reference blend in display space.
 *
 * @param mode Mode.
 * @param base Base 0..1.
 * @param color Layer color 0..1.
 * @param alpha Layer alpha 0..1.
 * @returns Blended value.
 */
function reference(mode: PaintBlendMode, base: number, color: number, alpha: number): number {
  const full = { normal: color, multiply: base * color, add: base + color, screen: 1 - (1 - base) * (1 - color) }[mode];
  if (mode === 'add') return Math.min(1, base + color * alpha);
  return base + (full - base) * alpha;
}

describe('Paint blend modes', () => {
  const pair = new Float32Array(2);

  it.each(PAINT_BLEND_MODES.map((mode) => mode.value))('matches the reference blend for %s', (mode) => {
    for (const base of [0, 0.2, 0.75, 1]) {
      for (const color of [0, 0.4, 1]) {
        for (const alpha of [0, 0.5, 1]) {
          paintBlendAffine(mode, color, alpha, pair);
          expect(paintAffineApply(base, pair[0] ?? 1, pair[1] ?? 0)).toBeCloseTo(
            reference(mode, base, color, alpha),
            5,
          );
        }
      }
    }
  });

  it('composes layers so one affine map equals applying them in order', () => {
    const affineA = new Float32Array([1]);
    const affineB = new Float32Array([0]);
    const layers: [PaintBlendMode, number, number][] = [
      ['normal', 0.8, 0.5],
      ['multiply', 0.3, 1],
      ['screen', 0.6, 0.4],
    ];
    let expected = 0.4;
    for (const [mode, color, alpha] of layers) {
      paintBlendAffine(mode, color, alpha, pair);
      paintAffineCompose(affineA, affineB, 0, pair[0] ?? 1, pair[1] ?? 0);
      expected = reference(mode, expected, color, alpha);
    }
    expect(paintAffineApply(0.4, affineA[0] ?? 1, affineB[0] ?? 0)).toBeCloseTo(expected, 5);
  });

  it('parses unknown modes as normal', () => {
    expect(paintBlendModeParse('multiply')).toBe('multiply');
    expect(paintBlendModeParse('darken')).toBe('normal');
    expect(paintBlendModeParse(3)).toBe('normal');
  });
});
