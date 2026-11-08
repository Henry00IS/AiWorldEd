import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import { CommandModifierVolumeBake } from '@/modifier/stack/bake/command_modifier_volume_bake.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { modifierStackStatusRead } from '@/modifier/stack/evaluate/modifier_stack_status.js';
import { MODIFIER_STACK_MIRROR_BISECT_EMPTY } from '@/modifier/stack/kinds/array/modifier_stack_kind_array_mirror.js';
import { expectStackConvex, stackFixture, stackResultBounds } from '../../modifier_stack_fixture.js';

/**
 * Returns the model-space X range of a brush.
 *
 * @param instance Compiled brush.
 * @returns Min and max X.
 */
function spanX(instance: SolidBrushInstance | undefined): [number, number] {
  if (!instance) throw new Error('Expected a brush');
  const box = new THREE.Box3().setFromPoints(instance.getModelSpaceBrush().vertices);
  return [box.min.x, box.max.x];
}

/**
 * Compiles a mirror with bisect settings.
 *
 * @param parameters Mirror parameter overrides.
 * @returns Fixture and compiled instances.
 */
function bisected(parameters: Record<string, unknown>) {
  const fixture = stackFixture([{ kind: 'mirror', parameters: { axis: 'x', bisect: true, ...parameters } }]);
  return { fixture, instances: fixture.compile().instances };
}

describe('mirror bisect', () => {
  it('keeps the positive half and mirrors it, staying convex and valid', () => {
    const { fixture, instances } = bisected({});
    expect(instances).toHaveLength(2);
    expect(instances[0]?.id).toBe(fixture.source.id);
    expect(spanX(instances[0])).toEqual([expect.closeTo(0), expect.closeTo(0.5)]);
    expect(spanX(instances[1])).toEqual([expect.closeTo(-0.5), expect.closeTo(0)]);
    for (const instance of instances) {
      expectStackConvex(instance);
      expect(SolidBrushValidator.validateGenerated(instance.brush).valid).toBe(true);
    }
  });

  it('keeps the negative half when flipped', () => {
    const { instances } = bisected({ flip: true });
    expect(spanX(instances[0])).toEqual([expect.closeTo(-0.5), expect.closeTo(0)]);
    expect(spanX(instances[1])).toEqual([expect.closeTo(0), expect.closeTo(0.5)]);
  });

  it('removes a brush entirely on the cut side and keeps one entirely on the kept side', () => {
    const gone = bisected({ planeOffset: 1 });
    expect(gone.instances).toHaveLength(1);
    expect(gone.instances[0]?.visible).toBe(false);
    const kept = bisected({ planeOffset: 1, flip: true });
    expect(kept.instances[0]).toBe(kept.fixture.source);
    expect(spanX(kept.instances[1])).toEqual([expect.closeTo(1.5), expect.closeTo(2.5)]);
  });

  it('cuts copies made earlier in the stack', () => {
    const fixture = stackFixture([
      { kind: 'linear', parameters: { mode: 'fixed', count: 2, offsetX: 0.25 } },
      { kind: 'mirror', parameters: { axis: 'x', bisect: true } },
    ]);
    const spans = fixture.compile().instances.map(spanX);
    expect(spans).toEqual([
      [expect.closeTo(0), expect.closeTo(0.5)],
      [expect.closeTo(-0.5), expect.closeTo(0)],
      [expect.closeTo(0), expect.closeTo(0.75)],
      [expect.closeTo(-0.75), expect.closeTo(0)],
    ]);
  });

  it('renders the cut in the solid and leaves old mirrors untouched', () => {
    const { fixture } = bisected({ planeOffset: 0.25 });
    fixture.refresh();
    expect(stackResultBounds(fixture.model).max.x).toBeCloseTo(0.5);
    expect(stackResultBounds(fixture.model).min.x).toBeCloseTo(0);
    const mirror = modifierStackKindFind('mirror');
    expect(mirror?.normalizeParameters({ axis: 'z' })).toMatchObject({ bisect: false, flip: false });
    expect(mirror?.passesAuthoredInput({ bisect: false })).toBe(true);
    expect(mirror?.passesAuthoredInput({ bisect: true })).toBe(false);
  });

  it('bakes the cut and the removal, and undoes both', () => {
    const cut = bisected({});
    const bake = new CommandModifierVolumeBake(cut.fixture.volume);
    bake.execute();
    expect(spanX(cut.fixture.source)).toEqual([expect.closeTo(0), expect.closeTo(0.5)]);
    expect(cut.fixture.model.getBrushes()).toHaveLength(2);
    bake.undo();
    expect(spanX(cut.fixture.source)).toEqual([expect.closeTo(-0.5), expect.closeTo(0.5)]);
    const gone = bisected({ planeOffset: 1 });
    const removal = new CommandModifierVolumeBake(gone.fixture.volume);
    removal.execute();
    expect(gone.fixture.source.mesh?.visible).toBe(false);
    removal.undo();
    expect(gone.fixture.source.mesh?.visible).toBe(true);
  });

  it('keeps the inside of the volume when the plane is a side', () => {
    for (const [plane, copy] of [
      ['max', [7.5, 8.5]],
      ['min', [-8.5, -7.5]],
    ] as const) {
      const { instances } = bisected({ plane });
      expect(instances.map(spanX)).toEqual([
        [expect.closeTo(-0.5), expect.closeTo(0.5)],
        [expect.closeTo(copy[0]), expect.closeTo(copy[1])],
      ]);
    }
  });

  it('warns instead of silently emptying the volume when nothing is kept', () => {
    const { fixture, instances } = bisected({ plane: 'max', flip: true });
    expect(instances.map((instance) => instance.constructor.name)).toEqual(['ModifierStackHiddenBrush']);
    expect(modifierStackStatusRead(fixture.volume)?.steps[0]?.error).toBe(MODIFIER_STACK_MIRROR_BISECT_EMPTY);
    const kept = bisected({ planeOffset: 0.25 });
    expect(modifierStackStatusRead(kept.fixture.volume)?.steps[0]?.error).toBe('');
  });

  it('cuts at the plane of a moved, rotated volume in a moved model', () => {
    const fixture = stackFixture([{ kind: 'mirror', parameters: { axis: 'x', bisect: true } }]);
    fixture.model.root.position.set(5, 0, 0);
    fixture.volume.position.set(5.25, 0, 0);
    fixture.volume.rotation.y = Math.PI;
    const spans = fixture.compile().instances.map(spanX);
    expect(spans).toEqual([
      [expect.closeTo(-0.5), expect.closeTo(0.25)],
      [expect.closeTo(0.25), expect.closeTo(1)],
    ]);
  });
});
