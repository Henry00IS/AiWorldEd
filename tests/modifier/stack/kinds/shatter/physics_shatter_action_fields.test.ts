import { describe, expect, it } from 'vitest';
import { modifierStackFieldsNormalize } from '@/modifier/stack/modifier_stack_fields.js';
import {
  PHYSICS_SHATTER_ACTION_FIELDS,
  PHYSICS_SHATTER_SOLVER_ITERATIONS_KEY,
} from '@/modifier/stack/kinds/shatter/physics_shatter_action_fields.js';
import { PHYSICS_SHATTER_FIELDS } from '@/modifier/stack/kinds/shatter/physics_shatter_fields.js';

/**
 * Normalizes one stored value of a Physics Shatter field.
 *
 * @param key Parameter key.
 * @param value Stored value, or undefined for none.
 * @returns Normalized value.
 */
function fieldValue(key: string, value: unknown): unknown {
  return modifierStackFieldsNormalize([...PHYSICS_SHATTER_FIELDS, ...PHYSICS_SHATTER_ACTION_FIELDS], { [key]: value })[
    key
  ];
}

describe('physics shatter simulation settings', () => {
  it('keeps solver iterations whole, 8 by default and between 1 and 16', () => {
    expect(fieldValue(PHYSICS_SHATTER_SOLVER_ITERATIONS_KEY, undefined)).toBe(8);
    expect(fieldValue(PHYSICS_SHATTER_SOLVER_ITERATIONS_KEY, 3.6)).toBe(4);
    expect(fieldValue(PHYSICS_SHATTER_SOLVER_ITERATIONS_KEY, 0)).toBe(1);
    expect(fieldValue(PHYSICS_SHATTER_SOLVER_ITERATIONS_KEY, 40)).toBe(16);
  });

  it('keeps the duration between 0.5 and 10 seconds', () => {
    expect(fieldValue('duration', undefined)).toBe(3);
    expect(fieldValue('duration', 0.1)).toBe(0.5);
    expect(fieldValue('duration', 20)).toBe(10);
  });
});
