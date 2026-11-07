import { describe, expect, it } from 'vitest';
import { Matrix4, Vector3 } from 'three';
import kind from '@/modifier/generator/kinds/transform/volume_kind.js';
import { ModifierGeneratorVolume } from '@/modifier/generator/modifier_generator_volume.js';
import { generatorRigidStep } from '@/modifier/generator/modifier_generator_math.js';
import { generatorFixture, expectGeneratorConvex } from './modifier_generator_fixture.js';

describe('transform array volume', () => {
  it('matches repeated rigid matrix composition for arbitrary yaw and tilt', () => {
    const fixture = generatorFixture(
      'transform',
      { offsetY: 0.25, rotationX: 15, rotationY: 30, rotationZ: 45, pivotX: 0.5 },
      9,
    );
    const step = generatorRigidStep(new Vector3(0, 0.25, 0), new Vector3(15, 30, 45), new Vector3(0.5, 0, 0));
    const delta = new Matrix4();
    const sourcePose = fixture.source.getModelSpaceMatrix();
    const output = fixture.expand().instances;
    expect(output).toHaveLength(9);
    output.forEach((copy, index) => {
      if (index) {
        delta.multiply(step);
        expectGeneratorConvex(copy);
      }
      copy.getModelSpaceBrush().vertices.forEach((vertex, vertexIndex) => {
        const source = fixture.source.brush.vertices[vertexIndex];
        if (!source) return;
        expect(vertex.distanceTo(source.clone().applyMatrix4(sourcePose).applyMatrix4(delta))).toBeLessThan(1e-6);
      });
    });
  });
  it('hides pivot properties when the step has no rotation', () => {
    const fixture = generatorFixture('transform', { rotationX: 0, rotationY: 0, rotationZ: 0 });
    const settings = ModifierGeneratorVolume.read(fixture.volume);
    expect(
      kind.fields.filter((field) => !field.visible || field.visible(settings)).map((field) => field.key),
    ).not.toContain('pivotX');
  });
  it('translates without shearing or scaling convex copies', () => {
    const fixture = generatorFixture('transform', { rotationY: 0, offsetX: 0.25, offsetY: 0.125 }, 5);
    const original = fixture.source.getModelSpaceBrush().computeLocalBounds().getSize(new Vector3());
    fixture
      .expand()
      .instances.slice(1)
      .forEach((copy) =>
        expect(copy.brush.computeLocalBounds().getSize(new Vector3()).distanceTo(original)).toBeLessThan(1e-7),
      );
  });
});
