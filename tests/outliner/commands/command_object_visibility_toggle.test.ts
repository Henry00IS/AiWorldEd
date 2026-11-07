import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CommandObjectVisibilityToggle } from '@/outliner/commands/command_object_visibility_toggle.js';
import { CommandStack } from '@/commands/command_stack.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierStackParameterSet } from '@/modifier/stack/modifier_stack_operations.js';
import { stackFixture, stackResultBounds } from '../../modifier/stack/modifier_stack_fixture.js';

describe('CommandObjectVisibilityToggle', () => {
  let mesh: THREE.Mesh;

  beforeEach(() => {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.name = 'TestMesh';
  });

  it('should execute and hide a visible object', () => {
    mesh.visible = true;
    const command = new CommandObjectVisibilityToggle(mesh);
    command.execute();
    expect(mesh.visible).toBe(false);
  });

  it('should execute and show a hidden object', () => {
    mesh.visible = false;
    const command = new CommandObjectVisibilityToggle(mesh);
    command.execute();
    expect(mesh.visible).toBe(true);
  });

  it('should undo and restore previous visibility state', () => {
    mesh.visible = true;
    const command = new CommandObjectVisibilityToggle(mesh);
    command.execute();
    command.undo();
    expect(mesh.visible).toBe(true);
  });

  it('should undo restoring hidden state', () => {
    mesh.visible = false;
    const command = new CommandObjectVisibilityToggle(mesh);
    command.execute();
    command.undo();
    expect(mesh.visible).toBe(false);
  });

  it('should redo and re-apply the visibility toggle', () => {
    mesh.visible = true;
    const command = new CommandObjectVisibilityToggle(mesh);
    command.execute();
    command.undo();
    command.execute();
    expect(mesh.visible).toBe(false);
  });

  it('should work with command stack for full undo/redo cycle', () => {
    const stack = new CommandStack(64);
    mesh.visible = true;
    const command = new CommandObjectVisibilityToggle(mesh);
    stack.push(command);
    expect(mesh.visible).toBe(false);
    stack.undo();
    expect(mesh.visible).toBe(true);
    stack.redo();
    expect(mesh.visible).toBe(false);
  });

  it('should handle toggling visibility on a group', () => {
    const group = new THREE.Group();
    group.name = 'TestGroup';
    group.visible = false;
    const command = new CommandObjectVisibilityToggle(group);
    command.execute();
    expect(group.visible).toBe(true);
    command.undo();
    expect(group.visible).toBe(false);
  });

  it('should return correct new visibility via getNewVisibility', () => {
    mesh.visible = true;
    const command = new CommandObjectVisibilityToggle(mesh);
    expect(command.getNewVisibility()).toBe(false);
  });

  it('should return correct new visibility for hidden object', () => {
    mesh.visible = false;
    const command = new CommandObjectVisibilityToggle(mesh);
    expect(command.getNewVisibility()).toBe(true);
  });

  it('should not execute twice', () => {
    mesh.visible = true;
    const command = new CommandObjectVisibilityToggle(mesh);
    command.execute();
    command.execute();
    expect(mesh.visible).toBe(false);
  });

  it('should preserve identity of the object', () => {
    const originalUuid = mesh.uuid;
    const command = new CommandObjectVisibilityToggle(mesh);
    command.execute();
    expect(mesh.uuid).toBe(originalUuid);
  });
});

/**
 * Builds a solid with a linear array volume and returns its bounds with and
 * without the volume's effect.
 *
 * @returns Fixture and reference bounds.
 */
function arrayed() {
  const fixture = stackFixture([{ kind: 'linear', parameters: { mode: 'fixed', count: 3, offsetX: 2 } }]);
  const plain = stackResultBounds(fixture.model).clone();
  fixture.refresh();
  const withVolume = stackResultBounds(fixture.model).clone();
  return { fixture, plain, withVolume };
}

describe('modifier volume visibility', () => {
  it('removes and restores the effect immediately when the volume is hidden and shown', () => {
    const { fixture, plain, withVolume } = arrayed();
    expect(withVolume.max.x).toBeGreaterThan(plain.max.x + 1);
    const hide = new CommandObjectVisibilityToggle(fixture.volume);
    hide.execute();
    expect(stackResultBounds(fixture.model).max.x).toBeCloseTo(plain.max.x);
    hide.undo();
    expect(stackResultBounds(fixture.model).max.x).toBeCloseTo(withVolume.max.x);
  });

  it('follows undo and redo through the command stack', () => {
    const { fixture, plain, withVolume } = arrayed();
    const stack = new CommandStack(64);
    stack.push(new CommandObjectVisibilityToggle(fixture.volume));
    expect(stackResultBounds(fixture.model).max.x).toBeCloseTo(plain.max.x);
    stack.undo();
    expect(stackResultBounds(fixture.model).max.x).toBeCloseTo(withVolume.max.x);
    stack.redo();
    expect(stackResultBounds(fixture.model).max.x).toBeCloseTo(plain.max.x);
  });

  it('rebuilds after a history step that only changed volume visibility', () => {
    const { fixture, plain } = arrayed();
    fixture.volume.visible = false;
    SolidModel.refreshAfterHistoryChange(fixture.world);
    expect(stackResultBounds(fixture.model).max.x).toBeCloseTo(plain.max.x);
  });

  it('follows a hidden parent group of the volume', () => {
    const { fixture, plain, withVolume } = arrayed();
    const group = new THREE.Group();
    fixture.world.add(group);
    group.add(fixture.volume);
    fixture.refresh();
    const hide = new CommandObjectVisibilityToggle(group);
    hide.execute();
    expect(stackResultBounds(fixture.model).max.x).toBeCloseTo(plain.max.x);
    hide.undo();
    expect(stackResultBounds(fixture.model).max.x).toBeCloseTo(withVolume.max.x);
  });

  it('drops the copies of a captured brush that is hidden and brings them back', () => {
    const { fixture, withVolume } = arrayed();
    const mesh = fixture.source.mesh;
    if (!mesh) throw new Error('Expected a source mesh');
    const hide = new CommandObjectVisibilityToggle(mesh);
    hide.execute();
    expect(fixture.model.getResultMesh().geometry.getAttribute('position')?.count ?? 0).toBe(0);
    hide.undo();
    expect(stackResultBounds(fixture.model).max.x).toBeCloseTo(withVolume.max.x);
  });

  it('re-evaluates the array when its cap object is hidden or shown', () => {
    const fixture = stackFixture([{ kind: 'linear', parameters: { mode: 'fixed', count: 3, offsetX: 2, endCap: '' } }]);
    const cap = fixture.model.addBoxBrush(1, SolidOperation.Additive);
    cap.mesh?.position.set(0, 3, 0);
    const stack = ModifierVolume.read(fixture.volume);
    const step = stack.modifiers[0]?.id ?? '';
    ModifierVolume.write(fixture.volume, modifierStackParameterSet(stack, step, 'endCap', cap.mesh?.uuid ?? ''));
    fixture.refresh();
    const shown = stackResultBounds(fixture.model).clone();
    const mesh = cap.mesh;
    if (!mesh) throw new Error('Expected a cap mesh');
    const hide = new CommandObjectVisibilityToggle(mesh);
    hide.execute();
    const hidden = stackResultBounds(fixture.model).clone();
    fixture.refresh();
    expect(stackResultBounds(fixture.model).equals(hidden)).toBe(true);
    hide.undo();
    expect(stackResultBounds(fixture.model).equals(shown)).toBe(true);
  });
});
