import { describe, expect, it } from 'vitest';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { arrayTestCentres } from './modifier_stack_array_test_helpers.js';

describe('linear array offsets', () => {
  it('adds the size multiple and the fixed step when both are used', () => {
    const centres = arrayTestCentres([
      { kind: 'linear', parameters: { mode: 'both', count: 3, relativeX: 1, offsetX: 0.5, offsetY: 0.25 } },
    ]);
    expect(centres.map((centre) => centre.x)).toEqual([0, 1.5, 3].map((value) => expect.closeTo(value, 6)));
    expect(centres.map((centre) => centre.y)).toEqual([0, 0.25, 0.5].map((value) => expect.closeTo(value, 6)));
  });

  it('shows the step and size fields together only when both are used', () => {
    const fields = modifierStackKindFind('linear')?.fields ?? [];
    const shown = (mode: string) =>
      fields.filter((field) => !field.visible || field.visible({ mode })).map((field) => field.key);
    expect(shown('both')).toEqual(expect.arrayContaining(['offsetX', 'relativeX', 'bounds']));
    expect(shown('fixed')).not.toContain('relativeX');
    expect(shown('relative')).not.toContain('offsetX');
  });
});
