import { describe, expect, it } from 'vitest';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { arrayTestCentres } from './modifier_stack_array_test_helpers.js';

describe('radial array rise', () => {
  it('raises every copy along the axis into a spiral', () => {
    const centres = arrayTestCentres([{ kind: 'radial', parameters: { count: 4, radius: 2, rise: 0.5 } }]);
    expect(centres.map((centre) => centre.y)).toEqual([0, 0.5, 1, 1.5].map((value) => expect.closeTo(value, 6)));
    const flat = arrayTestCentres([{ kind: 'radial', parameters: { count: 4, radius: 2 } }]);
    centres.forEach((centre, index) => {
      expect(centre.x).toBeCloseTo(flat[index]?.x ?? Number.NaN, 6);
      expect(centre.z).toBeCloseTo(flat[index]?.z ?? Number.NaN, 6);
    });
  });

  it('rises without turning the copies and leaves old radial arrays flat', () => {
    const centres = arrayTestCentres([
      { kind: 'radial', parameters: { count: 3, radius: 2, rise: 1, rotateCopies: false } },
    ]);
    expect(centres[2]?.y).toBeCloseTo(2, 6);
    expect(modifierStackKindFind('radial')?.normalizeParameters({ mode: 'ring' })['rise']).toBe(0);
  });
});
