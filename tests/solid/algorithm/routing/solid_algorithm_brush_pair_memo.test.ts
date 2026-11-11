import { describe, it, expect } from 'vitest';
import { SolidAlgorithmBrushPairMemo } from '@/solid/algorithm/routing/solid_algorithm_brush_pair_memo.js';

/** SolidAlgorithmBrushPairMemo stores one value per ordered pair of key objects. */
describe('SolidAlgorithmBrushPairMemo', () => {
  it('returns stored values only for the same ordered key pair', () => {
    const memo = new SolidAlgorithmBrushPairMemo<number>();
    const first = {};
    const second = {};
    memo.set(first, second, 7);
    expect(memo.get(first, second)).toBe(7);
    expect(memo.get(second, first)).toBeUndefined();
    expect(memo.get(first, {})).toBeUndefined();
  });

  it('overwrites a pair and forgets everything on clear', () => {
    const memo = new SolidAlgorithmBrushPairMemo<string>();
    const first = {};
    const second = {};
    memo.set(first, second, 'old');
    memo.set(first, second, 'new');
    expect(memo.get(first, second)).toBe('new');
    memo.clear();
    expect(memo.get(first, second)).toBeUndefined();
  });

  it('answers correctly when lookups alternate between first keys and after clearing', () => {
    const memo = new SolidAlgorithmBrushPairMemo<number>();
    const a = {};
    const b = {};
    const peer = {};
    expect(memo.get(a, peer)).toBeUndefined();
    memo.set(a, peer, 1);
    memo.set(b, peer, 2);
    expect(memo.get(a, peer)).toBe(1);
    expect(memo.get(b, peer)).toBe(2);
    expect(memo.get(a, peer)).toBe(1);
    memo.clear();
    expect(memo.get(a, peer)).toBeUndefined();
    memo.set(a, peer, 3);
    expect(memo.get(a, peer)).toBe(3);
  });
});
