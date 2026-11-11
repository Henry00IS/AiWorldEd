import { describe, it, expect } from 'vitest';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidFragmentClassificationMemo } from '@/solid/algorithm/compile/solid_fragment_classification_memo.js';
import { SurfaceCategory } from '@/solid/types/surface_category.js';

/** SolidFragmentClassificationMemo remembers peer categories of one fragment. */
describe('SolidFragmentClassificationMemo', () => {
  it('answers nothing until sealed, then answers for the same peer geometry only', () => {
    const memo = new SolidFragmentClassificationMemo();
    const geometry = SolidBrushFactory.createCenteredBox(1, 1, 1);
    memo.remember(3, geometry, SurfaceCategory.Inside);
    expect(memo.categoryFor(3, geometry)).toBeUndefined();
    memo.seal();
    expect(memo.categoryFor(3, geometry)).toBe(SurfaceCategory.Inside);
    expect(memo.categoryFor(3, SolidBrushFactory.createCenteredBox(1, 1, 1))).toBeUndefined();
    expect(memo.categoryFor(4, geometry)).toBeUndefined();
  });

  it('updates an entry in place after sealing and reports consulted peers', () => {
    const memo = new SolidFragmentClassificationMemo();
    const before = SolidBrushFactory.createCenteredBox(1, 1, 1);
    const after = SolidBrushFactory.createCenteredBox(2, 2, 2);
    memo.remember(5, before, SurfaceCategory.Outside);
    memo.seal();
    memo.remember(5, after, SurfaceCategory.Inside);
    expect(memo.categoryFor(5, before)).toBeUndefined();
    expect(memo.categoryFor(5, after)).toBe(SurfaceCategory.Inside);
    expect(memo.consultedAny([1, 5])).toBe(true);
    expect(memo.consultedAny([1, 2])).toBe(false);
  });

  it('keeps the entries of memos filled one after another apart', () => {
    const geometry = SolidBrushFactory.createCenteredBox(1, 1, 1);
    const first = new SolidFragmentClassificationMemo();
    first.remember(1, geometry, SurfaceCategory.Inside);
    first.seal();
    const second = new SolidFragmentClassificationMemo();
    second.remember(2, geometry, SurfaceCategory.Outside);
    second.seal();
    expect(first.categoryFor(1, geometry)).toBe(SurfaceCategory.Inside);
    expect(first.consultedAny([2])).toBe(false);
    expect(second.categoryFor(2, geometry)).toBe(SurfaceCategory.Outside);
    expect(second.consultedAny([1])).toBe(false);
  });

  it('keeps the entries of memos filled at the same time apart', () => {
    const geometry = SolidBrushFactory.createCenteredBox(1, 1, 1);
    const outer = new SolidFragmentClassificationMemo();
    const inner = new SolidFragmentClassificationMemo();
    outer.remember(1, geometry, SurfaceCategory.Inside);
    inner.remember(2, geometry, SurfaceCategory.Outside);
    outer.remember(3, geometry, SurfaceCategory.Aligned);
    inner.seal();
    outer.seal();
    expect(outer.consultedAny([2])).toBe(false);
    expect(outer.categoryFor(3, geometry)).toBe(SurfaceCategory.Aligned);
    expect(inner.consultedAny([1, 3])).toBe(false);
    expect(inner.categoryFor(2, geometry)).toBe(SurfaceCategory.Outside);
  });
});
