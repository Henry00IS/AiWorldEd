import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import {
  MODIFIER_STACK_ARRAY_RANDOM_FIELDS,
  modifierStackRandomTransform,
  modifierStackRandomValue,
} from '@/modifier/stack/kinds/array/modifier_stack_array_random.js';
import { expectStackConvex, stackFixture } from '../../modifier_stack_fixture.js';
import { arrayTestCentre } from './modifier_stack_array_test_helpers.js';

/** Linear array of five unit cubes two metres apart with randomize on. */
const LINEAR = { kind: 'linear', parameters: { mode: 'fixed', count: 5, offsetX: 2, randomize: true } };

/**
 * Compiles a linear array with extra parameters.
 *
 * @param parameters Parameter overrides.
 * @returns Fixture and compiled brushes.
 */
function randomLinear(parameters: Record<string, unknown>) {
  const fixture = stackFixture([{ ...LINEAR, parameters: { ...LINEAR.parameters, ...parameters } }], 40);
  return { fixture, instances: fixture.compile().instances };
}

/**
 * Returns every model-space vertex of every brush, rounded for comparison.
 *
 * @param instances Brushes.
 * @returns Rounded coordinates.
 */
function shapes(instances: readonly SolidBrushInstance[]): number[][] {
  return instances.map((instance) =>
    instance
      .getModelSpaceBrush()
      .vertices.flatMap((vertex) => vertex.toArray().map((value) => Math.round(value * 1e6))),
  );
}

/**
 * Asserts every brush is convex and passes generated-brush validation.
 *
 * @param instances Brushes.
 */
function expectAllValid(instances: readonly SolidBrushInstance[]): void {
  for (const instance of instances) {
    expectStackConvex(instance);
    expect(SolidBrushValidator.validateGenerated(instance.brush).valid).toBe(true);
  }
}

describe('array randomize', () => {
  it('uses a fixed integer hash, the same on every machine and client', () => {
    expect(modifierStackRandomValue(0, 1, 0, 0)).toBe(0.25444731558673084);
    expect(modifierStackRandomValue(7, 3, 2, 5)).toBe(0.867359965108335);
  });

  it('gives the same layout for the same seed and another for another seed', () => {
    const settings = { randomOffsetY: 1, randomRotationZ: 30, randomScale: 0.3, randomSeed: 4 };
    const first = shapes(randomLinear(settings).instances);
    expect(shapes(randomLinear(settings).instances)).toEqual(first);
    expect(shapes(randomLinear({ ...settings, randomSeed: 5 }).instances)).not.toEqual(first);
    expect(first.slice(1).some((shape, index) => shape.join() !== first[index]?.join())).toBe(true);
  });

  it('keeps offsets within the maximum on each axis', () => {
    const { instances } = randomLinear({ randomOffsetX: 0.5, randomOffsetY: 1, randomOffsetZ: 0 });
    instances.forEach((instance, index) => {
      const centre = arrayTestCentre(instance);
      expect(Math.abs(centre.x - index * 2)).toBeLessThanOrEqual(0.5 + 1e-9);
      expect(Math.abs(centre.y)).toBeLessThanOrEqual(1 + 1e-9);
      expect(centre.z).toBeCloseTo(0);
    });
  });

  it('excludes the original by default, and the last copy on request', () => {
    const { fixture, instances } = randomLinear({ randomOffsetY: 1, randomExcludeLast: true, randomSeed: 2 });
    expect(instances[0]).toBe(fixture.source);
    expect(arrayTestCentre(instances[4] as SolidBrushInstance).toArray()).toEqual([
      expect.closeTo(8),
      expect.closeTo(0),
      expect.closeTo(0),
    ]);
    expect(instances.slice(1, 4).some((instance) => Math.abs(arrayTestCentre(instance).y) > 1e-3)).toBe(true);
  });

  it('randomizes the original when Exclude First is off', () => {
    const { fixture, instances } = randomLinear({ randomOffsetY: 1, randomExcludeFirst: false, randomSeed: 2 });
    const original = instances[0];
    expect(original).not.toBe(fixture.source);
    expect(original?.id).toBe(fixture.source.id);
    expect(Math.abs(arrayTestCentre(original as SolidBrushInstance).y)).toBeGreaterThan(1e-3);
    const linear = modifierStackKindFind('linear');
    expect(linear?.passesAuthoredInput({ randomize: true, randomExcludeFirst: false })).toBe(false);
    expect(linear?.passesAuthoredInput({ randomize: true, randomExcludeFirst: true })).toBe(true);
  });

  it('keeps rotated, scaled and flipped copies convex and valid', () => {
    const { instances } = randomLinear({
      randomRotationX: 180,
      randomRotationY: 180,
      randomRotationZ: 180,
      randomScaleAxes: 'axes',
      randomScaleX: 2,
      randomScaleY: 0.9,
      randomScaleZ: 10,
      randomFlipX: true,
      randomFlipZ: true,
      randomSeed: 11,
    });
    expect(instances).toHaveLength(5);
    expectAllValid(instances);
  });

  it('scales uniformly within the range and never collapses a copy', () => {
    const pivot = new THREE.Vector3();
    for (let index = 1; index < 40; index++) {
      const matrix = modifierStackRandomTransform(
        { randomize: true, randomScale: 0.2, randomScaleAxes: 'uniform', randomSeed: 3 },
        { index, count: 40, salt: 0, pivot },
      );
      const scale = new THREE.Vector3().setFromMatrixScale(matrix);
      expect(scale.x).toBeCloseTo(scale.y);
      expect(scale.x).toBeGreaterThanOrEqual(0.8 - 1e-9);
      expect(scale.x).toBeLessThanOrEqual(1.2 + 1e-9);
    }
    const crushed = modifierStackRandomTransform(
      { randomize: true, randomScale: 10, randomSeed: 1 },
      { index: 1, count: 3, salt: 0, pivot },
    );
    expect(new THREE.Vector3().setFromMatrixScale(crushed).x).toBeGreaterThanOrEqual(0.05 - 1e-9);
  });

  it('flips a random share of copies only on chosen axes', () => {
    const pivot = new THREE.Vector3();
    const determinants = Array.from({ length: 30 }, (_, index) =>
      modifierStackRandomTransform(
        { randomize: true, randomFlipY: true },
        { index: index + 1, count: 99, salt: 0, pivot },
      ).determinant(),
    );
    expect(determinants.some((value) => value < 0)).toBe(true);
    expect(determinants.some((value) => value > 0)).toBe(true);
    expect(determinants.every((value) => Math.abs(Math.abs(value) - 1) < 1e-9)).toBe(true);
  });

  it('randomizes radial and transform arrays too', () => {
    for (const kind of ['radial', 'transform']) {
      const fixture = stackFixture(
        [{ kind, parameters: { count: 6, randomize: true, randomRotationY: 45, randomScale: 0.5, randomSeed: 9 } }],
        40,
      );
      const plain = stackFixture([{ kind, parameters: { count: 6 } }], 40);
      const instances = fixture.compile().instances;
      expect(instances).toHaveLength(6);
      expectAllValid(instances);
      expect(shapes(instances)).not.toEqual(shapes(plain.compile().instances));
    }
  });

  it('varies values per piece when sizes come from each piece', () => {
    const pivot = new THREE.Vector3();
    const parameters = { randomize: true, randomOffsetX: 1 };
    const a = modifierStackRandomTransform(parameters, { index: 1, count: 3, salt: 1, pivot }).elements[12];
    const b = modifierStackRandomTransform(parameters, { index: 1, count: 3, salt: 2, pivot }).elements[12];
    expect(a).not.toBeCloseTo(b ?? 0);
  });

  it('changes nothing for old saves and shows its fields only when on', () => {
    const linear = modifierStackKindFind('linear');
    const old = linear?.normalizeParameters({ mode: 'fixed', count: 3 }) ?? {};
    expect(old).toMatchObject({ randomize: false, randomSeed: 0, randomExcludeFirst: true, randomExcludeLast: false });
    const plain = shapes(stackFixture([{ kind: 'linear', parameters: { count: 3 } }]).compile().instances);
    const off = shapes(
      stackFixture([{ kind: 'linear', parameters: { count: 3, randomOffsetX: 5, randomSeed: 3 } }]).compile().instances,
    );
    expect(off).toEqual(plain);
    const shown = (parameters: Record<string, unknown>) =>
      MODIFIER_STACK_ARRAY_RANDOM_FIELDS.filter((field) => field.visible?.(parameters) ?? true).map(
        (field) => field.key,
      );
    expect(shown({ randomize: false })).toEqual(['randomize']);
    expect(shown({ randomize: true, randomScaleAxes: 'uniform' })).toContain('randomScale');
    expect(shown({ randomize: true, randomScaleAxes: 'uniform' })).not.toContain('randomScaleX');
    expect(shown({ randomize: true, randomScaleAxes: 'axes' })).toContain('randomScaleX');
    expect(modifierStackKindFind('mirror')?.fields.some((field) => field.key === 'randomize')).toBe(false);
  });
});
