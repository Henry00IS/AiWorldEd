import { describe, expect, it } from 'vitest';
import { decalFragmentsEqual, type DecalFragment } from '@/decal/fragment/decal_fragment.js';

/**
 * Returns a one-triangle fragment whose first x coordinate is given.
 *
 * @param firstX First position value.
 * @returns Fragment.
 */
function oneTriangle(firstX: number): DecalFragment {
  return {
    positions: new Float32Array([firstX, 0, 0, 1, 0, 0, 0, 0, 1]),
    normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]),
    uvs: new Float32Array([0, 0, 1, 0, 0, 1]),
    triangleCount: 1,
  };
}

describe('decalFragmentsEqual', () => {
  it('treats two missing fragments as equal and one missing as different', () => {
    expect(decalFragmentsEqual(undefined, null)).toBe(true);
    expect(decalFragmentsEqual(oneTriangle(0), null)).toBe(false);
  });

  it('compares fragments value by value', () => {
    expect(decalFragmentsEqual(oneTriangle(0), oneTriangle(0))).toBe(true);
    expect(decalFragmentsEqual(oneTriangle(0), oneTriangle(0.5))).toBe(false);
  });
});
