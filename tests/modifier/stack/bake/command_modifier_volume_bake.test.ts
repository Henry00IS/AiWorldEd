import { describe, expect, it } from 'vitest';
import { CommandModifierVolumeBake } from '@/modifier/stack/bake/command_modifier_volume_bake.js';
import type * as THREE from 'three';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { modifierStackTreeInsert } from '@/modifier/stack/evaluate/modifier_stack_tree.js';
import { stackFixture, stackResultBounds } from '../modifier_stack_fixture.js';

describe('modifier volume bake', () => {
  it('turns array copies into authored brushes, removes the volume and undoes cleanly', () => {
    const fixture = stackFixture([{ kind: 'linear', parameters: { mode: 'fixed', offsetX: 2 } }]);
    fixture.refresh();
    const bake = new CommandModifierVolumeBake(fixture.volume);
    expect(bake.createdCount()).toBe(2);
    bake.execute();
    expect(fixture.volume.parent).toBeNull();
    expect(fixture.model.getBrushes()).toHaveLength(3);
    fixture.model.rebuild(true);
    expect(stackResultBounds(fixture.model).max.x).toBeCloseTo(4.5);
    const baked = fixture.model.getBrushes()[2];
    expect(baked?.position.x).toBeCloseTo(4);
    bake.undo();
    expect(fixture.volume.parent).toBe(fixture.world);
    expect(fixture.model.getBrushes()).toHaveLength(1);
    expect(stackResultBounds(fixture.model).max.x).toBeCloseTo(4.5);
  });

  it('keeps the chamfer of bevelled authored brushes and restores the box on undo', () => {
    const fixture = stackFixture(['bevel']);
    fixture.refresh();
    const bake = new CommandModifierVolumeBake(fixture.volume);
    bake.execute();
    expect(fixture.source.brush.vertices.length).toBeGreaterThan(8);
    bake.undo();
    expect(fixture.source.brush.vertices).toHaveLength(8);
  });

  it('bakes generated stairs into separate convex brushes', () => {
    const fixture = stackFixture([{ kind: 'stairs', parameters: { sizing: 'count', count: 3 } }, 'bevel'], 2);
    fixture.refresh();
    const bake = new CommandModifierVolumeBake(fixture.volume);
    bake.execute();
    expect(fixture.model.getBrushes()).toHaveLength(4);
    expect(fixture.model.getBrushes()[1]?.brush.vertices.length).toBeGreaterThan(8);
    bake.undo();
    expect(fixture.model.getBrushes()).toHaveLength(1);
  });
});

describe('modifier volume bake scene order', () => {
  it('inserts copies right after their source and keeps ids across undo and redo', () => {
    const fixture = stackFixture([{ kind: 'linear', parameters: { mode: 'fixed', offsetX: 2, count: 3 } }], 2);
    const outside = fixture.model.addBoxBrush(1, SolidOperation.Subtractive);
    outside.mesh?.position.set(20, 0, 0);
    fixture.refresh();
    const bake = new CommandModifierVolumeBake(fixture.volume);
    bake.execute();
    const ids = fixture.model.getBrushes().map((brush) => brush.id);
    expect(ids[0]).toBe(fixture.source.id);
    expect(ids[3]).toBe(outside.id);
    bake.undo();
    expect(fixture.model.getBrushes().map((brush) => brush.id)).toEqual([fixture.source.id, outside.id]);
    bake.execute();
    expect(fixture.model.getBrushes().map((brush) => brush.id)).toEqual(ids);
  });

  it('places generated pieces at the volume position in the solid, in compile and in bake', () => {
    const fixture = stackFixture([{ kind: 'stairs', parameters: { sizing: 'count', count: 3 } }], 2);
    const later = fixture.model.addBoxBrush(1, SolidOperation.Subtractive);
    later.mesh?.position.set(20, 0, 0);
    fixture.model.root.add(fixture.volume);
    modifierStackTreeInsert(
      fixture.model.root,
      fixture.volume,
      fixture.model.root.children.indexOf(later.mesh as THREE.Object3D),
    );
    const compiled = fixture.compile();
    const order = compiled.root.children.map((node) => node.uuid);
    const authoredIds = [fixture.source.mesh?.uuid, later.mesh?.uuid];
    const generated = order.flatMap((uuid, index) => (authoredIds.includes(uuid) ? [] : [index]));
    expect(generated).toHaveLength(3);
    const sourceIndex = order.indexOf(fixture.source.mesh?.uuid ?? '');
    const laterIndex = order.indexOf(later.mesh?.uuid ?? '');
    expect(generated.every((index) => index > sourceIndex && index < laterIndex)).toBe(true);
    fixture.refresh();
    const bake = new CommandModifierVolumeBake(fixture.volume);
    bake.execute();
    const ids = fixture.model.getBrushes().map((brush) => brush.id);
    expect(ids).toHaveLength(5);
    expect(ids[0]).toBe(fixture.source.id);
    expect(ids[4]).toBe(later.id);
    bake.undo();
    expect(fixture.volume.parent).toBe(fixture.model.root);
    expect(fixture.model.root.children.indexOf(fixture.volume)).toBeLessThan(
      fixture.model.root.children.indexOf(later.mesh as THREE.Object3D),
    );
    bake.execute();
    expect(fixture.model.getBrushes().map((brush) => brush.id)).toEqual(ids);
  });
});
