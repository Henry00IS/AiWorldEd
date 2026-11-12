import { describe, expect, it } from 'vitest';
import { resolveCornerJoinIds } from '@/layout/area/area_corner_gesture.js';

describe('resolveCornerJoinIds', () => {
  it('keeps the drag source and closes the neighbor under the pointer', () => {
    const join = resolveCornerJoinIds('front', 'perspective');
    expect(join.survivorId).toBe('front');
    expect(join.removeId).toBe('perspective');
  });

  it('does not invert when dragging the other direction', () => {
    const join = resolveCornerJoinIds('perspective', 'front');
    expect(join.survivorId).toBe('perspective');
    expect(join.removeId).toBe('front');
  });
});
