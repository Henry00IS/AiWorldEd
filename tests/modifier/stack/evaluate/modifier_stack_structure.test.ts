import { describe, expect, it } from 'vitest';
import {
  modifierStackDerivedStructure,
  modifierStackRegrouped,
} from '@/modifier/stack/evaluate/modifier_stack_structure.js';
import { stackFixture } from '../modifier_stack_fixture.js';

/**
 * Compiles an arch with an operation and returns its group paths.
 *
 * @param operation CSG operation.
 * @returns Group paths in brush order.
 */
function paths(operation: string): string[] {
  const fixture = stackFixture([{ kind: 'arch', parameters: { operation } }], 4);
  return [...modifierStackDerivedStructure(fixture.compile().instances.slice(1)).values()];
}

describe('derived structure', () => {
  it('changes when generated pieces move into an intersecting group', () => {
    expect(paths('add')).not.toEqual(paths('intersect'));
    expect(paths('add')).toEqual(paths('add'));
  });

  it('counts only kept brushes that changed groups', () => {
    const before = new Map([
      ['a', ''],
      ['b', ''],
    ]);
    expect(modifierStackRegrouped(before, new Map([['a', '']]))).toBe(false);
    expect(modifierStackRegrouped(before, new Map([...before, ['c', '2']]))).toBe(false);
    expect(modifierStackRegrouped(before, new Map([['a', '2']]))).toBe(true);
  });
});
