import { describe, expect, it } from 'vitest';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { modifierStackStatusRead } from '@/modifier/stack/evaluate/modifier_stack_status.js';
import { modifierStackIsDerived } from '@/modifier/stack/evaluate/modifier_stack_copy.js';
import { modifierStackMove, modifierStackPatch } from '@/modifier/stack/modifier_stack_operations.js';
import { CommandModifierStackSet } from '@/modifier/stack/command_modifier_stack_set.js';
import { ModifierBevelSurfaceOverlay } from '@/modifier/compile/modifier_bevel_surface_overlay.js';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { expectStackConvex, stackFixture, stackFixtureEntries, stackResultBounds } from '../modifier_stack_fixture.js';

/**
 * Counts the vertices of every compiled brush.
 *
 * @param instances Compile list.
 * @returns Vertex total.
 */
function vertexTotal(instances: readonly { brush: { vertices: readonly unknown[] } }[]): number {
  return instances.reduce((sum, instance) => sum + instance.brush.vertices.length, 0);
}

describe('modifier stack compile', () => {
  it('evaluates deterministically with stable derived ids and never authors brushes', () => {
    const fixture = stackFixture(['linear']);
    const before = new SceneSerializer().serialize(fixture.world);
    const first = fixture.compile();
    const second = fixture.compile();
    expect(first.instances.map((brush) => brush.id)).toEqual(second.instances.map((brush) => brush.id));
    expect(first.instances[1]?.id).toBe(`${fixture.source.id}#${fixture.volume.uuid}:m1:1`);
    expect(fixture.model.getBrushes()).toHaveLength(1);
    expect(new SceneSerializer().serialize(fixture.world)).toEqual(before);
  });

  it('captures only authored brushes, so overlapping volumes cannot feed each other', () => {
    const fixture = stackFixture(['linear']);
    const second = ModifierVolume.create({ modifiers: stackFixtureEntries(['linear']) });
    second.scale.setScalar(40);
    fixture.world.add(second);
    const result = fixture.compile();
    expect(result.instances).toHaveLength(5);
    expect(result.instances.slice(1).every((brush) => modifierStackIsDerived(brush.mesh))).toBe(true);
    expect(modifierStackStatusRead(second)?.captured).toBe(1);
  });

  it('runs Stairs, then Bevel on every step, then Mirror on the bevelled steps', () => {
    const fixture = stackFixture(
      [
        { kind: 'stairs', parameters: { sizing: 'count', count: 4 } },
        'bevel',
        { kind: 'mirror', parameters: { axis: 'z' } },
      ],
      2,
    );
    const result = fixture.compile();
    const derived = result.instances.slice(1);
    expect(derived).toHaveLength(8);
    for (const step of derived) {
      expect(step.brush.vertices.length).toBeGreaterThan(8);
      expectStackConvex(step);
    }
    expect(ModifierBevelSurfaceOverlay.textureOverride(derived[0]?.id ?? '')).toBe('');
    expect(modifierStackStatusRead(fixture.volume)?.steps.map((step) => step.outputs)).toEqual([4, 4, 8]);
  });

  it('gives different results for array then bevel and bevel then array', () => {
    const arrayFirst = stackFixture([{ kind: 'linear', parameters: { mode: 'fixed', offsetX: 1 } }, 'bevel'], 3);
    const bevelFirst = stackFixture(['bevel', { kind: 'linear', parameters: { mode: 'fixed', offsetX: 1 } }], 3);
    const a = arrayFirst.compile().instances;
    const b = bevelFirst.compile().instances;
    expect(a).toHaveLength(3);
    expect(b).toHaveLength(3);
    for (const brush of [...a, ...b]) expectStackConvex(brush);
    expect(vertexTotal(a)).not.toBe(vertexTotal(b));
  });

  it('passes input through muted modifiers and evaluates the stack in its new order', () => {
    const fixture = stackFixture([
      { kind: 'linear', parameters: { mode: 'fixed', offsetX: 2 }, enabled: false },
      'mirror',
    ]);
    expect(fixture.compile().instances).toHaveLength(2);
    const stack = ModifierVolume.read(fixture.volume);
    new CommandModifierStackSet(fixture.volume, stack, modifierStackPatch(stack, 'm1', { enabled: true })).execute();
    expect(fixture.compile().instances).toHaveLength(6);
    const reordered = modifierStackMove(ModifierVolume.read(fixture.volume), 'm2', 0);
    ModifierVolume.write(fixture.volume, reordered);
    expect(fixture.compile().instances).toHaveLength(6);
    expect(modifierStackStatusRead(fixture.volume)?.steps.map((step) => step.outputs)).toEqual([2, 6]);
  });

  it('keeps unknown modifiers as pass-through with a warning', () => {
    const fixture = stackFixture(['linear']);
    const stack = ModifierVolume.read(fixture.volume);
    ModifierVolume.write(fixture.volume, {
      ...stack,
      modifiers: [
        { id: 'x1', kind: 'future', name: 'Future', enabled: true, expanded: true, parameters: { a: 1 } },
        ...stack.modifiers,
      ],
    });
    expect(fixture.compile().instances).toHaveLength(3);
    expect(modifierStackStatusRead(fixture.volume)?.steps[0]?.error).toContain('not installed');
  });

  it('clamps huge counts and NaN parameters and caps derived output', () => {
    const fixture = stackFixture([
      { kind: 'linear', parameters: { count: 1e9, offsetX: Number.NaN } },
      { kind: 'linear', parameters: { count: 1e9 } },
    ]);
    const stack = ModifierVolume.read(fixture.volume);
    expect(stack.modifiers[0]?.parameters['count']).toBe(256);
    expect(Number.isFinite(Number(stack.modifiers[0]?.parameters['offsetX']))).toBe(true);
    const result = fixture.compile();
    expect(result.instances.length).toBeLessThanOrEqual(4097);
    expect(modifierStackStatusRead(fixture.volume)?.steps[1]?.error).toContain('budget');
    for (const brush of result.instances)
      expect(brush.brush.vertices.every((vertex) => Number.isFinite(vertex.x + vertex.y + vertex.z))).toBe(true);
  });

  it('ignores degenerate volumes', () => {
    const fixture = stackFixture(['stairs', 'linear']);
    fixture.volume.scale.set(1, 0, 1);
    expect(fixture.compile().instances).toHaveLength(1);
  });

  it('emits generated pieces once, into the solid the volume belongs to', () => {
    const fixture = stackFixture([{ kind: 'stairs', parameters: { sizing: 'count', count: 3 } }]);
    const other = new SolidModel('Other');
    fixture.world.add(other.root);
    other.addBoxBrush(1);
    fixture.model.root.add(fixture.volume);
    fixture.world.updateMatrixWorld(true);
    expect(fixture.compile().instances).toHaveLength(4);
    expect(modifierStackCompile(other.getBrushes(), other.root).instances).toHaveLength(1);
  });

  it('compiles derived brushes into the visible result and drops them when the volume is hidden', () => {
    const fixture = stackFixture([{ kind: 'linear', parameters: { mode: 'fixed', offsetX: 2 } }]);
    fixture.refresh();
    expect(stackResultBounds(fixture.model).max.x).toBeCloseTo(4.5);
    fixture.volume.visible = false;
    fixture.refresh();
    expect(stackResultBounds(fixture.model).max.x).toBeCloseTo(0.5);
  });

  it('keeps every derived brush convex for every modifier kind', () => {
    for (const kind of ['linear', 'radial', 'transform', 'mirror', 'stairs', 'arch', 'column']) {
      const fixture = stackFixture([kind, 'bevel'], 4);
      fixture.source.mesh?.position.set(1, 0.2, 0.3);
      for (const brush of fixture.compile().instances) expectStackConvex(brush);
    }
  });
});
