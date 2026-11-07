import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import kind from '@/modifier/generator/kinds/mirror/volume_kind.js';
import { ModifierGeneratorVolume } from '@/modifier/generator/modifier_generator_volume.js';
import { generatorFixture, expectGeneratorConvex } from './modifier_generator_fixture.js';

describe('mirror volume', () => {
  it.each(['x', 'y', 'z'])('reflects across %s with outward planes and reciprocal twins', (axis) => {
    const fixture = generatorFixture('mirror', { axis, planeOffset: 0.25 });
    const output = fixture.expand().instances;
    expect(output).toHaveLength(2);
    const copy = output[1];
    if (!copy) return;
    expectGeneratorConvex(copy);
    const center = fixture.source.getModelSpaceBrush().computeLocalBounds().getCenter(new Vector3());
    const component = axis as 'x' | 'y' | 'z';
    center[component] = 0.5 - center[component];
    expect(copy.brush.computeLocalBounds().getCenter(new Vector3()).distanceTo(center)).toBeLessThan(1e-7);
  });
  it('reverses U at mirrored correspondence so copied lettering keeps its handedness', () => {
    const fixture = generatorFixture('mirror');
    const copy = fixture.expand().instances[1];
    if (!copy) return;
    fixture.source.brush.faces.forEach((_, face) =>
      fixture.source.brush.vertices.forEach((point, index) => {
        const target = copy.brush.vertices[index];
        if (!target) return;
        const original = fixture.source.getFaceSurface(face).uv.project(point);
        const mirrored = copy.getFaceSurface(face).uv.project(target);
        expect(mirrored.u).toBeCloseTo(1 - original.u);
        expect(mirrored.v).toBeCloseTo(original.v);
      }),
    );
  });
  it('hides handedness correction for world projection and fixes count at two', () => {
    const fixture = generatorFixture('mirror');
    ModifierGeneratorVolume.write(fixture.volume, {
      ...ModifierGeneratorVolume.read(fixture.volume),
      count: 127,
      uv: 'world',
    });
    const settings = ModifierGeneratorVolume.read(fixture.volume);
    expect(settings.count).toBe(2);
    expect(
      kind.fields.filter((field) => !field.visible || field.visible(settings)).map((field) => field.key),
    ).not.toContain('readable');
  });
});
