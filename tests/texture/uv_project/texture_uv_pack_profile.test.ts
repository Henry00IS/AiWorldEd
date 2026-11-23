import { describe, expect, it } from 'vitest';
import { textureUvPackIslands } from '@/texture/uv_project/texture_uv_pack.js';
import { textureUvPackProfiles } from '@/texture/uv_project/texture_uv_pack_profile.js';

type Loop = [number, number][];

/**
 * True when two convex loops overlap by more than a sliver, by separating axes.
 *
 * @param a First loop.
 * @param b Second loop.
 * @returns Whether they overlap.
 */
function overlaps(a: Loop, b: Loop): boolean {
  const axes = [a, b].flatMap((loop) =>
    loop.map(([u, v], index) => {
      const [nu, nv] = loop[(index + 1) % loop.length]!;
      return [v - nv, nu - u] as const;
    }),
  );
  return axes.every(([x, y]) => {
    const spread = (loop: Loop) => loop.map(([u, v]) => u * x + v * y);
    const [sa, sb] = [spread(a), spread(b)];
    return Math.min(Math.max(...sa), Math.max(...sb)) - Math.max(Math.min(...sa), Math.min(...sb)) > 1e-6;
  });
}

/**
 * Length of a loop's first side.
 *
 * @param loop Loop.
 * @returns Length.
 */
function side(loop: Loop): number {
  const [[u, v], [nu, nv]] = loop as [[number, number], [number, number]];
  return Math.hypot(nu - u, nv - v);
}

/**
 * Checks every face of every island against every face of the other islands,
 * and that all lie in the 0–1 square.
 *
 * @param islands Packed islands.
 */
function expectApart(islands: Loop[][]): void {
  islands.flat(2).forEach(([u, v]) => expect(Math.min(u, v) >= -1e-9 && Math.max(u, v) <= 1 + 1e-9).toBe(true));
  islands.forEach((island, at) =>
    islands
      .slice(at + 1)
      .forEach((other) => island.forEach((face) => other.forEach((loop) => expect(overlaps(face, loop)).toBe(false)))),
  );
}

const TRIANGLE: Loop = [
  [0, 0],
  [1, 0],
  [0, 1],
];
const L_SHAPE: Loop[] = [
  [
    [0, 0],
    [2, 0],
    [2, 1],
    [0, 1],
  ],
  [
    [0, 1],
    [1, 1],
    [1, 2],
    [0, 2],
  ],
];
const SQUARE: Loop = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

describe('textureUvPackProfiles', () => {
  it('nests two right triangles into one square by their convex hulls, where boxes leave half empty', () => {
    const boxes = textureUvPackIslands([TRIANGLE, TRIANGLE], 0.001);
    const hulls = textureUvPackProfiles([[TRIANGLE], [TRIANGLE]], 0.001, 'Convex Hull', true);
    expectApart(hulls);
    expect(side(boxes[0] as Loop)).toBeLessThan(0.55);
    expect(side(hulls[0]![0]!)).toBeGreaterThan(0.85);
  });

  it('keeps the way islands face without Turn', () => {
    const packed = textureUvPackProfiles([[TRIANGLE], [TRIANGLE]], 0.001, 'Convex Hull', false);
    expectApart(packed);
    for (const [face] of packed) expect(face![1]![1]).toBeCloseTo(face![0]![1], 9);
  });

  it('fits a square into the notch of an L by Exact Shape but not by Convex Hull', () => {
    const exact = textureUvPackProfiles([L_SHAPE, [SQUARE]], 0.001, 'Exact Shape', false);
    const hull = textureUvPackProfiles([L_SHAPE, [SQUARE]], 0.001, 'Convex Hull', false);
    expectApart(exact);
    expectApart(hull);
    expect(side(exact[1]![0]!)).toBeGreaterThan(0.45);
    expect(side(hull[1]![0]!)).toBeLessThan(0.4);
  });

  it('packs many islands apart and scales them alike', () => {
    const islands = Array.from({ length: 12 }, (_, index) => [
      TRIANGLE.map(([u, v]): [number, number] => [u * (1 + (index % 3)), v * (1 + (index % 4)) * 0.5]),
    ]);
    const packed = textureUvPackProfiles(islands, 0.01, 'Exact Shape', true);
    expectApart(packed);
    const scale = side(packed[0]![0]!) / side(islands[0]![0]!);
    packed.forEach((island, at) => expect(side(island[0]!) / side(islands[at]![0]!)).toBeCloseTo(scale, 6));
  });
});
