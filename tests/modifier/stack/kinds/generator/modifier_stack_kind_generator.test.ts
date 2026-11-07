import { describe, expect, it } from 'vitest';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { stackFixture } from '../../modifier_stack_fixture.js';

/**
 * Returns the operations of generated pieces.
 *
 * @param kind Generator kind.
 * @param parameters Parameters.
 * @returns Operation per piece.
 */
function operations(kind: string, parameters: Record<string, unknown>): SolidOperation[] {
  return stackFixture([{ kind, parameters }], 4)
    .compile()
    .instances.slice(1)
    .map((instance) => instance.operation);
}

describe('generator operation', () => {
  it('adds by default, so old saves build the same', () => {
    expect(modifierStackKindFind('arch')?.normalizeParameters({})['operation']).toBe('add');
    const added = operations('arch', { output: 'opening' });
    expect(added.length).toBeGreaterThan(0);
    expect(added.every((operation) => operation === SolidOperation.Additive)).toBe(true);
  });

  it('carves every piece of any generator when set to subtract', () => {
    for (const kind of ['arch', 'stairs', 'column']) {
      const carved = operations(kind, { output: 'opening', operation: 'subtract' });
      expect(carved.length).toBeGreaterThan(0);
      expect(carved.every((operation) => operation === SolidOperation.Subtractive)).toBe(true);
    }
  });

  it('intersects when set to intersect', () => {
    const kept = operations('arch', { operation: 'intersect' });
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.every((operation) => operation === SolidOperation.Intersecting)).toBe(true);
  });
});
