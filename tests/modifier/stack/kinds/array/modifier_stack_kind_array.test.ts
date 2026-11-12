import { describe, expect, it } from 'vitest';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { stackFixture, type StackFixtureStep } from '../../modifier_stack_fixture.js';
import { arrayTestCentre } from './modifier_stack_array_test_helpers.js';

/**
 * Compiles a one-unit cube and a two-unit-wide box through one step.
 *
 * @param step Array step.
 * @returns Copy centre X keyed by source id order: [small copies, wide copies].
 */
function twoPieces(step: StackFixtureStep): number[][] {
  const fixture = stackFixture([step]);
  const wide = fixture.model.addBoxBrush(1, SolidOperation.Additive);
  wide.mesh?.position.set(0, 0, 2);
  wide.mesh?.scale.set(2, 1, 1);
  const instances = fixture.compile().instances;
  return [fixture.source.id, wide.id].map((id) =>
    instances
      .filter((instance) => instance.id === id || instance.id.startsWith(`${id}#`))
      .map((instance) => arrayTestCentre(instance).x),
  );
}

describe('array size source', () => {
  it('defaults to the whole input so every piece shares one step', () => {
    const kind = modifierStackKindFind('linear');
    expect(kind?.normalizeParameters({})['bounds']).toBe('whole');
    const [small, wide] = twoPieces({ kind: 'linear', parameters: { mode: 'relative', count: 2, relativeX: 1 } });
    expect(small?.[1]).toBeCloseTo(2);
    expect(wide?.[1]).toBeCloseTo(2);
  });

  it('spaces each piece by its own size when set to each piece', () => {
    const [small, wide] = twoPieces({
      kind: 'linear',
      parameters: { mode: 'relative', count: 3, relativeX: 1, bounds: 'piece' },
    });
    expect(small).toEqual([0, 1, 2].map((value) => expect.closeTo(value, 6)));
    expect(wide).toEqual([0, 2, 4].map((value) => expect.closeTo(value, 6)));
  });

  it('keeps unrotated radial pieces around their own centres when set to each piece', () => {
    const parameters = { origin: 'centre', mode: 'ring', count: 2, rotateCopies: false, radiusOffset: 1 };
    const whole = twoPieces({ kind: 'radial', parameters });
    const piece = twoPieces({ kind: 'radial', parameters: { ...parameters, bounds: 'piece' } });
    expect(piece[0]?.[1]).not.toBeCloseTo(whole[0]?.[1] ?? 0, 3);
    expect(piece.flat().every(Number.isFinite)).toBe(true);
  });
});

describe('array per-copy texture shift', () => {
  it('moves each copy texture by the shift times its index and leaves the original alone', () => {
    const fixture = stackFixture([
      { kind: 'linear', parameters: { mode: 'fixed', count: 3, offsetX: 2, uvShiftU: 0.25, uvShiftV: -0.5 } },
    ]);
    const instances = fixture.compile().instances;
    const shift = (index: number) => {
      const copy = instances[index]?.getFaceSurface(0).uv;
      const plain = stackFixture([{ kind: 'linear', parameters: { mode: 'fixed', count: 3, offsetX: 2 } }])
        .compile()
        .instances[index]?.getFaceSurface(0).uv;
      return [(copy?.u.w ?? 0) - (plain?.u.w ?? 0), (copy?.v.w ?? 0) - (plain?.v.w ?? 0)];
    };
    expect(shift(0)).toEqual([0, 0]);
    expect(shift(1)).toEqual([expect.closeTo(0.25, 9), expect.closeTo(-0.5, 9)]);
    expect(shift(2)).toEqual([expect.closeTo(0.5, 9), expect.closeTo(-1, 9)]);
  });

  it('defaults the shift to zero for saved arrays', () => {
    const parameters = modifierStackKindFind('mirror')?.normalizeParameters({ axis: 'x' }) ?? {};
    expect([parameters['uvShiftU'], parameters['uvShiftV']]).toEqual([0, 0]);
  });
});
