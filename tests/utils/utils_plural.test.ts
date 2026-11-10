import { describe, expect, it } from 'vitest';
import { textCount } from '@/utils/utils_plural.js';

describe('counted words', () => {
  it('uses the singular for one and the plural otherwise', () => {
    expect(textCount(1, 'texture')).toBe('1 texture');
    expect(textCount(0, 'texture')).toBe('0 textures');
    expect(textCount(2, 'stone material')).toBe('2 stone materials');
    expect(textCount(3, 'surface region')).toBe('3 surface regions');
  });

  it('takes an irregular plural', () => {
    expect(textCount(2, 'face region', 'face regions')).toBe('2 face regions');
    expect(textCount(2, 'match', 'matches')).toBe('2 matches');
  });
});
