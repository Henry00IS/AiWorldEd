import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import kind from '@/modifier/generator/kinds/linear/volume_kind.js';
import { ModifierGeneratorVolume } from '@/modifier/generator/modifier_generator_volume.js';
import { generatorFixture, expectGeneratorConvex } from './modifier_generator_fixture.js';

describe('linear array volume', () => {
  it.each(['fixed', 'relative', 'fit'])('measures %s spacing from the immutable source, not its own output', (mode) => {
    const fixture = generatorFixture('linear', { mode, offsetX: 2, relativeX: 1.5, endpointX: 12 }, 7);
    const expansion = fixture.expand();
    const originalBounds = fixture.source.getModelSpaceBrush().computeLocalBounds();
    const step = mode === 'relative' ? originalBounds.getSize(new Vector3()).x * 1.5 : mode === 'fit' ? 12 / 6 : 2;
    const start = originalBounds.getCenter(new Vector3());
    expect(expansion.instances).toHaveLength(7);
    expansion.instances.slice(1).forEach((copy, index) => {
      expect(copy.brush.computeLocalBounds().getCenter(new Vector3()).x).toBeCloseTo(start.x + step * (index + 1));
      expectGeneratorConvex(copy);
    });
    expect(fixture.model.getBrushes()).toHaveLength(1);
  });
  it('rotates the spacing basis but does not scale metre offsets with the capture box', () => {
    const fixture = generatorFixture('linear', { offsetX: 2 });
    fixture.volume.rotation.z = Math.PI / 2;
    const expansion = fixture.expand();
    const center = expansion.instances[1]?.brush.computeLocalBounds().getCenter(new Vector3());
    expect(center?.x).toBeCloseTo(2);
    expect(center?.y).toBeCloseTo(2);
  });
  it('offers only the active spacing properties', () => {
    const { volume } = generatorFixture('linear', { mode: 'relative' });
    const settings = ModifierGeneratorVolume.read(volume);
    const visible = kind.fields.filter((field) => !field.visible || field.visible(settings)).map((field) => field.key);
    expect(visible).toContain('relativeX');
    expect(visible).not.toContain('offsetX');
    expect(visible).not.toContain('endpointX');
  });
  it('keeps copied UVs identical at corresponding source and derived vertices', () => {
    const { source, expand } = generatorFixture('linear');
    const copy = expand().instances[1];
    expect(copy).toBeDefined();
    if (!copy) return;
    source.brush.faces.forEach((_, face) =>
      source.brush.vertices.forEach((point, index) => {
        const copied = copy.brush.vertices[index];
        if (!copied) return;
        expect(copy.getFaceSurface(face).uv.project(copied)).toEqual(source.getFaceSurface(face).uv.project(point));
      }),
    );
  });
});
