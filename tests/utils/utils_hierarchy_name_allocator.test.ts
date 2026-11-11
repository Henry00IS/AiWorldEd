import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  HierarchyNameAllocator,
  extractHierarchyNameBase,
  formatHierarchyHexIndex,
  hexDigitsForIndex,
  hierarchyNameAllocator,
  parseHierarchyHexSuffix,
  scrambleHierarchyIndex,
  sequentialIndexFromHierarchyName,
  unscrambleHierarchyIndex,
} from '@/utils/utils_hierarchy_name_allocator.js';

describe('HierarchyNameAllocator', () => {
  let allocator: HierarchyNameAllocator;

  beforeEach(() => {
    allocator = new HierarchyNameAllocator();
    hierarchyNameAllocator.reset();
  });

  it('uses at least three hex digits and grows width with magnitude', () => {
    expect(hexDigitsForIndex(1)).toBe(3);
    expect(hexDigitsForIndex(0xfff)).toBe(3);
    expect(hexDigitsForIndex(0x1000)).toBe(4);
    expect(hexDigitsForIndex(0xffff)).toBe(4);
    expect(hexDigitsForIndex(0x10000)).toBe(5);
    expect(formatHierarchyHexIndex(1).length).toBe(3);
    expect(formatHierarchyHexIndex(0xfff).length).toBe(3);
    expect(formatHierarchyHexIndex(0x1000).length).toBe(4);
    expect(formatHierarchyHexIndex(0x10000).length).toBe(5);
  });

  it('scrambles indices so early suffixes are not 001,002,003', () => {
    const a = formatHierarchyHexIndex(1);
    const b = formatHierarchyHexIndex(2);
    const c = formatHierarchyHexIndex(3);
    expect(a).not.toBe('001');
    expect(b).not.toBe('002');
    expect(c).not.toBe('003');
    expect([a, b, c]).not.toEqual(['001', '002', '003']);
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('round-trips scramble for 12-bit and wider rings', () => {
    for (let index = 0; index <= 0xfff; index++) {
      expect(unscrambleHierarchyIndex(scrambleHierarchyIndex(index, 12), 12)).toBe(index);
    }
    for (const index of [0x1000, 0x2345, 0xffff, 0x10000, 0xabcde, 0xfffff]) {
      const bits = hexDigitsForIndex(index) * 4;
      expect(unscrambleHierarchyIndex(scrambleHierarchyIndex(index, bits), bits)).toBe(index);
    }
  });

  it('keeps the first 4095 formatted suffixes unique and three digits wide', () => {
    const seen = new Set<string>();
    for (let index = 1; index <= 0xfff; index++) {
      const suffix = formatHierarchyHexIndex(index);
      expect(suffix.length).toBe(3);
      expect(seen.has(suffix)).toBe(false);
      seen.add(suffix);
    }
    expect(seen.size).toBe(0xfff);
  });

  it('parses trailing hex suffixes and name bases', () => {
    expect(parseHierarchyHexSuffix('Brush.A3F')).toBe(0xa3f);
    expect(parseHierarchyHexSuffix('MyWall')).toBeNull();
    expect(extractHierarchyNameBase('Brush.A3F')).toBe('Brush');
    expect(extractHierarchyNameBase('MyWall')).toBe('MyWall');
  });

  it('allocates a shared global stream with scrambled suffixes', () => {
    const first = allocator.allocate('Brush');
    const second = allocator.allocate('Group');
    const third = allocator.allocate('Cube');
    expect(first.startsWith('Brush.')).toBe(true);
    expect(second.startsWith('Group.')).toBe(true);
    expect(third.startsWith('Cube.')).toBe(true);
    expect(first.split('.')[1]!.length).toBe(3);
    expect(new Set([first, second, third]).size).toBe(3);
    expect(sequentialIndexFromHierarchyName(first)).toBe(1);
    expect(sequentialIndexFromHierarchyName(second)).toBe(2);
    expect(sequentialIndexFromHierarchyName(third)).toBe(3);
  });

  it('advances past noted existing scrambled suffixes on rebuild', () => {
    const world = new THREE.Group();
    const brush = new THREE.Mesh();
    brush.name = `Brush.${formatHierarchyHexIndex(10)}`;
    world.add(brush);
    allocator.rebuildFromWorld(world);
    const next = allocator.allocate('Group');
    expect(sequentialIndexFromHierarchyName(next)).toBeGreaterThanOrEqual(11);
  });

  it('allocates from a source name base for duplicates', () => {
    const first = allocator.allocate('Brush');
    const dup = allocator.allocateFromSourceName(first);
    expect(dup.startsWith('Brush.')).toBe(true);
    expect(dup).not.toBe(first);
    expect(sequentialIndexFromHierarchyName(dup)).toBe(2);
  });

  it('ignores absurd hand-typed hex tails so allocate cannot hang', () => {
    allocator.noteExistingName('Brush.2F7AAAAAAAAAAAAAAAA');
    const next = allocator.allocate('Brush');
    expect(next.startsWith('Brush.')).toBe(true);
    expect(next.split('.')[1]!.length).toBe(3);
    expect(sequentialIndexFromHierarchyName('Brush.2F7AAAAAAAAAAAAAAAA')).toBeNull();
    expect(sequentialIndexFromHierarchyName(next)).toBe(1);
  });

  it('does not treat overlong suffixes as auto-ids for dual-tone stream math', () => {
    expect(parseHierarchyHexSuffix('Brush.2F7AAAAAAAAAAAAAAAA')).toBeNull();
    expect(parseHierarchyHexSuffix(`Brush.${formatHierarchyHexIndex(1)}`)).not.toBeNull();
  });

  it('no-ops auto hex suffixes once the sequential range is exhausted', () => {
    allocator.noteExistingName(`Brush.${formatHierarchyHexIndex(0xfffff)}`);
    const next = allocator.allocate('Group');
    expect(next === 'Group' || next.startsWith('Group_')).toBe(true);
    expect(next.includes('.')).toBe(false);
  });
});
