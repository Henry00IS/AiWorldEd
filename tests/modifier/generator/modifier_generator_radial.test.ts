import { describe, expect, it } from 'vitest';
import { Matrix4, Vector3 } from 'three';
import kind, { radialAngle } from '@/modifier/generator/kinds/radial/volume_kind.js';
import { ModifierGeneratorVolume } from '@/modifier/generator/modifier_generator_volume.js';
import { generatorFixture, expectGeneratorConvex } from './modifier_generator_fixture.js';

describe('radial array volume', () => {
  it('builds 24 distinct placements at 15-degree intervals without the closing duplicate', () => {
    const fixture = generatorFixture('radial', { mode: 'ring' }, 24);
    const settings = ModifierGeneratorVolume.read(fixture.volume);
    const output = fixture.expand().instances;
    const sourceCenter = fixture.source.getModelSpaceBrush().computeLocalBounds().getCenter(new Vector3());
    expect(output).toHaveLength(24);
    const centers = output.map((copy, index) => {
      if (index) expectGeneratorConvex(copy);
      const expected = sourceCenter.clone().applyAxisAngle(new Vector3(0, 1, 0), radialAngle(index, settings));
      const actual = copy.getModelSpaceBrush().computeLocalBounds().getCenter(new Vector3());
      expect(actual.distanceTo(expected)).toBeLessThan(1e-6);
      return actual
        .toArray()
        .map((value) => value.toFixed(5))
        .join(',');
    });
    expect(new Set(centers).size).toBe(24);
  });
  it('supports explicit 15-degree steps, a start offset and an inclusive open sweep', () => {
    const fixture = generatorFixture('radial', { mode: 'step', step: 15, start: 30 }, 8);
    let settings = ModifierGeneratorVolume.read(fixture.volume);
    expect(radialAngle(1, settings)).toBeCloseTo(Math.PI / 4);
    ModifierGeneratorVolume.write(fixture.volume, {
      ...settings,
      parameters: { ...settings.parameters, mode: 'arc', sweep: 105, start: 0 },
    });
    settings = ModifierGeneratorVolume.read(fixture.volume);
    expect(radialAngle(7, settings)).toBeCloseTo((105 * Math.PI) / 180);
  });
  it('can move placements around the arc without rotating the copies', () => {
    const fixture = generatorFixture('radial', { rotateCopies: false }, 4);
    const copy = fixture.expand().instances[1];
    expect(copy).toBeDefined();
    if (!copy) return;
    expect(copy.brush.computeLocalBounds().getSize(new Vector3()).toArray()).toEqual(
      fixture.source.getModelSpaceBrush().computeLocalBounds().getSize(new Vector3()).toArray(),
    );
    expect(
      kind
        .transform(1, {
          settings: ModifierGeneratorVolume.read(fixture.volume),
          bounds: fixture.source.getModelSpaceBrush().computeLocalBounds(),
        })
        .determinant(),
    ).toBeCloseTo(new Matrix4().determinant());
  });
  it('only exposes the selected angle distribution controls', () => {
    const fixture = generatorFixture('radial', { mode: 'step' });
    const settings = ModifierGeneratorVolume.read(fixture.volume);
    const fields = kind.fields.filter((field) => !field.visible || field.visible(settings)).map((field) => field.key);
    expect(fields).toContain('step');
    expect(fields).not.toContain('sweep');
  });
});
