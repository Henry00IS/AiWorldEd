import { describe, expect, it } from 'vitest';
import { PaintAtlasAllocator } from '@/paint/atlas/paint_atlas_allocator.js';
import { PAINT_PAGE_SLOT_COUNT } from '@/paint/paint_constants.js';

describe('Paint atlas allocator', () => {
  it('hands out the lowest free slot and reuses freed ones', () => {
    const allocator = new PaintAtlasAllocator();
    expect(allocator.allocate('a')).toBe(0);
    expect(allocator.allocate('b')).toBe(1);
    expect(allocator.allocate('c')).toBe(2);
    expect(allocator.allocate('a')).toBe(0);
    allocator.free('b');
    expect(allocator.ownerOf(1)).toBeNull();
    expect(allocator.allocate('d')).toBe(1);
    expect(allocator.allocate('e')).toBe(3);
  });

  it('grows by whole pages only when every slot is taken', () => {
    const allocator = new PaintAtlasAllocator();
    for (let index = 0; index < PAINT_PAGE_SLOT_COUNT; index++) allocator.allocate(`t${index}`);
    expect(allocator.pageCount).toBe(1);
    expect(allocator.allocate('overflow')).toBe(PAINT_PAGE_SLOT_COUNT);
    expect(allocator.pageCount).toBe(2);
  });

  it('compacts tiles out of trailing pages and drops them', () => {
    const allocator = new PaintAtlasAllocator();
    for (let index = 0; index < PAINT_PAGE_SLOT_COUNT + 3; index++) allocator.allocate(`t${index}`);
    for (let index = 0; index < 10; index++) allocator.free(`t${index}`);
    expect(allocator.canShrink()).toBe(true);
    const moves = allocator.compact();
    expect(moves).toHaveLength(3);
    expect(allocator.pageCount).toBe(1);
    for (const move of moves) {
      expect(move.from).toBeGreaterThanOrEqual(PAINT_PAGE_SLOT_COUNT);
      expect(move.to).toBeLessThan(10);
      expect(allocator.get(move.key)).toBe(move.to);
      expect(allocator.ownerOf(move.to)).toBe(move.key);
    }
    expect(allocator.usedCount).toBe(PAINT_PAGE_SLOT_COUNT - 7);
    expect(allocator.allocate('next')).toBe(3);
  });

  it('drops every page once nothing is left', () => {
    const allocator = new PaintAtlasAllocator();
    allocator.allocate('a');
    allocator.free('a');
    allocator.compact();
    expect(allocator.pageCount).toBe(0);
    expect(allocator.allocate('b')).toBe(0);
  });
});
