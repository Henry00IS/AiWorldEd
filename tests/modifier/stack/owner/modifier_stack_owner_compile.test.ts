import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { markAsSolidCsgGroup } from '@/solid/model/solid_group.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { modifierStackStatusRead } from '@/modifier/stack/evaluate/modifier_stack_status.js';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';
import { CommandModifierStackSet } from '@/modifier/stack/command_modifier_stack_set.js';
import {
  modifierStackOwnerDecode,
  modifierStackOwnerEncode,
  modifierStackOwnerIs,
} from '@/modifier/stack/owner/modifier_stack_owner.js';
import {
  expectStackConvex,
  stackFixtureEntries,
  stackResultBounds,
  type StackFixtureStep,
} from '../modifier_stack_fixture.js';

/**
 * Builds a solid with one box brush that owns the given stack.
 *
 * @param steps Modifiers of the brush's own stack.
 * @returns Fixture parts and a compile helper.
 */
function ownerBrushFixture(steps: readonly StackFixtureStep[]) {
  const world = new THREE.Group();
  const model = new SolidModel('Owner test');
  world.add(model.root);
  const source = model.addBoxBrush(1, SolidOperation.Additive);
  const mesh = source.mesh as THREE.Mesh;
  modifierStackOwnerDecode(mesh, { modifiers: stackFixtureEntries(steps) });
  const compile = () => {
    world.updateMatrixWorld(true);
    return modifierStackCompile(model.getBrushes(), model.root);
  };
  return { world, model, source, mesh, compile };
}

/**
 * Builds a solid whose CSG group holds two brushes and owns the given stack.
 *
 * @param steps Modifiers of the group's own stack.
 * @returns Fixture parts and a compile helper.
 */
function ownerGroupFixture(steps: readonly StackFixtureStep[]) {
  const world = new THREE.Group();
  const model = new SolidModel('Owner group test');
  world.add(model.root);
  const group = new THREE.Group();
  markAsSolidCsgGroup(group, SolidOperation.Additive);
  model.root.add(group);
  const first = model.addBoxBrush(1, SolidOperation.Additive);
  const second = model.addBoxBrush(1, SolidOperation.Additive);
  second.mesh?.position.set(1, 0, 0);
  for (const brush of [first, second]) if (brush.mesh) group.add(brush.mesh);
  model.syncBrushOrderFromScene();
  modifierStackOwnerDecode(group, { modifiers: stackFixtureEntries(steps) });
  const compile = () => {
    world.updateMatrixWorld(true);
    return modifierStackCompile(model.getBrushes(), model.root);
  };
  return { world, model, group, first, second, compile };
}

describe('modifier stacks owned by brushes and groups', () => {
  it('copies a brush with its own array stack, without any volume in the scene', () => {
    const fixture = ownerBrushFixture([{ kind: 'linear', parameters: { mode: 'fixed', offsetX: 2, count: 3 } }]);
    const result = fixture.compile();
    expect(result.instances).toHaveLength(3);
    expect(result.instances[1]?.id).toBe(`${fixture.source.id}#${fixture.mesh.uuid}:m1:1`);
    expect(fixture.model.getBrushes()).toHaveLength(1);
    expect(modifierStackStatusRead(fixture.mesh)?.captured).toBe(1);
    expect(modifierStackStatusRead(fixture.mesh)?.derived).toBe(2);
  });

  it('never captures brushes outside the owner', () => {
    const fixture = ownerBrushFixture([{ kind: 'linear', parameters: { mode: 'fixed', offsetX: 2, count: 2 } }]);
    const neighbour = fixture.model.addBoxBrush(1, SolidOperation.Additive);
    neighbour.mesh?.position.set(0, 0, 0.5);
    expect(fixture.compile().instances).toHaveLength(3);
    expect(modifierStackStatusRead(fixture.mesh)?.captured).toBe(1);
  });

  it('copies a whole CSG group as one operand', () => {
    const fixture = ownerGroupFixture([{ kind: 'linear', parameters: { mode: 'fixed', offsetZ: 3, count: 2 } }]);
    const result = fixture.compile();
    expect(result.instances).toHaveLength(4);
    expect(modifierStackStatusRead(fixture.group)?.captured).toBe(2);
    for (const brush of result.instances) expectStackConvex(brush);
  });

  it('bevels a brush that owns a bevel and keeps it convex', () => {
    const fixture = ownerBrushFixture(['bevel']);
    const result = fixture.compile();
    expect(result.instances).toHaveLength(1);
    expect(result.instances[0]?.brush.vertices.length).toBeGreaterThan(8);
    expectStackConvex(result.instances[0]!);
  });

  it('bevels the copies an earlier array made, far outside the brush', () => {
    const fixture = ownerBrushFixture([
      { kind: 'linear', parameters: { mode: 'fixed', offsetX: 4, count: 3 } },
      'bevel',
    ]);
    const result = fixture.compile();
    expect(result.instances).toHaveLength(3);
    for (const brush of result.instances) {
      expect(brush.brush.vertices.length).toBeGreaterThan(8);
      expectStackConvex(brush);
    }
  });

  it('mirrors around the owner itself, so moving the brush moves the mirror', () => {
    const fixture = ownerBrushFixture([{ kind: 'mirror', parameters: { axis: 'x' } }]);
    fixture.mesh.position.set(5, 0, 0);
    const result = fixture.compile();
    expect(result.instances).toHaveLength(2);
    for (const brush of result.instances) expectStackConvex(brush);
  });

  it('builds the result through a scene refresh and drops copies when the stack is muted', () => {
    const fixture = ownerBrushFixture([{ kind: 'linear', parameters: { mode: 'fixed', offsetX: 2, count: 2 } }]);
    modifierBevelRefreshScene(fixture.world);
    expect(stackResultBounds(fixture.model).max.x).toBeCloseTo(2.5);
    const before = ModifierVolume.read(fixture.mesh);
    const command = new CommandModifierStackSet(fixture.mesh, before, { ...before, enabled: false });
    command.execute();
    expect(stackResultBounds(fixture.model).max.x).toBeCloseTo(0.5);
    command.undo();
    expect(stackResultBounds(fixture.model).max.x).toBeCloseTo(2.5);
  });

  it('round-trips the stack and clears the key when it becomes empty', () => {
    const fixture = ownerBrushFixture(['mirror']);
    expect(modifierStackOwnerIs(fixture.mesh)).toBe(true);
    expect(ModifierVolume.isVolume(fixture.mesh)).toBe(false);
    const saved = modifierStackOwnerEncode(fixture.mesh);
    expect(saved?.modifiers.map((step) => step.kind)).toEqual(['mirror']);
    modifierStackOwnerDecode(fixture.mesh, { ...saved, modifiers: [] });
    expect(modifierStackOwnerIs(fixture.mesh)).toBe(false);
    expect(modifierStackOwnerEncode(fixture.mesh)).toBeUndefined();
  });
});
