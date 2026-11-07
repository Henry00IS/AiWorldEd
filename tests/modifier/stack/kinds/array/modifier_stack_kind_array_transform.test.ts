import { describe, expect, it } from 'vitest';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { arrayTestCentres } from './modifier_stack_array_test_helpers.js';

describe('transform array offsets', () => {
  it('adds a multiple of the input size to every move', () => {
    const centres = arrayTestCentres([
      { kind: 'transform', parameters: { count: 3, offsetX: 0.5, offsetY: 0, relativeX: 1, rotationY: 0 } },
    ]);
    expect(centres.map((centre) => centre.x)).toEqual([0, 1.5, 3].map((value) => expect.closeTo(value, 6)));
  });

  it('keeps old transform arrays unchanged and shows the size source only with a size multiple', () => {
    const kind = modifierStackKindFind('transform');
    const parameters = kind?.normalizeParameters({ count: 2, offsetX: 1 }) ?? {};
    expect([parameters['relativeX'], parameters['relativeY'], parameters['relativeZ']]).toEqual([0, 0, 0]);
    const bounds = kind?.fields.find((field) => field.key === 'bounds');
    expect(bounds?.visible?.(parameters)).toBe(false);
    expect(bounds?.visible?.({ ...parameters, relativeX: 1 })).toBe(true);
  });
});
