import { describe, expect, it } from 'vitest';
import { nameOrderCompare, nameOrderCompareWithPath } from '@/utils/utils_name_order.js';

describe('utils_name_order', () => {
  it('ignores case and orders numbers by value', () => {
    expect(['tex10', 'Banana', 'apple', 'tex2'].sort(nameOrderCompare)).toEqual(['apple', 'Banana', 'tex2', 'tex10']);
  });

  it('breaks name ties by path, then exactly', () => {
    expect(nameOrderCompareWithPath('a', 'z/a', 'a', 'y/a')).toBeGreaterThan(0);
    expect(nameOrderCompareWithPath('a', 'A', 'a', 'a')).toBeLessThan(0);
    expect(nameOrderCompareWithPath('a', 'x', 'a', 'x')).toBe(0);
  });
});
