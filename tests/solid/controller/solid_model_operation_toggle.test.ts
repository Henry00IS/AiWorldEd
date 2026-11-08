import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotificationGlobal } from '@/audio/notification/notification_global.js';
import * as THREE from 'three';
import { CommandStack } from '@/commands/command_stack.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SolidModelController } from '@/solid/controller/solid_model_controller.js';
import { markAsSolidCsgGroup } from '@/solid/model/solid_group.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierGeneratorOperationRead } from '@/modifier/stack/modifier_generator_operation.js';

/** Lightweight panel stand-in for operation toggle tests. */
class MockSolidPanel {
  private model: SolidModel | null = null;

  /**
   * Stores the active solid model for the panel.
   *
   * @param model Solid model, or null.
   */
  setModel(model: SolidModel | null): void {
    this.model = model;
  }

  /**
   * Returns the stored solid model.
   *
   * @returns Active model, or null.
   */
  getModel(): SolidModel | null {
    return this.model;
  }

  /** No-op refresh for tests. */
  refresh(): void {
    return;
  }
}

describe('SolidModelController.toggleAdditiveSubtractiveOnSelection', () => {
  let world: THREE.Group;
  let stack: CommandStack;
  let selection: ManagerSelection;
  let controller: SolidModelController;

  beforeEach(() => {
    world = new THREE.Group();
    stack = new CommandStack(16);
    selection = new ManagerSelection();
    controller = new SolidModelController(world, stack, selection, new MockSolidPanel() as never);
  });

  it('flips each selected brush independently in one undo step', () => {
    const model = new SolidModel('ToggleSolid');
    world.add(model.root);
    const additive = model.addBoxBrush(2, SolidOperation.Additive);
    const subtractive = model.addBoxBrush(2, SolidOperation.Subtractive);
    additive.mesh!.position.set(-3, 0, 0);
    subtractive.mesh!.position.set(3, 0, 0);
    additive.pushTransformToMesh();
    subtractive.pushTransformToMesh();
    selection.setSelection([additive.mesh!, subtractive.mesh!]);
    controller.toggleAdditiveSubtractiveOnSelection();
    expect(model.findBrush(additive.id)?.operation).toBe(SolidOperation.Subtractive);
    expect(model.findBrush(subtractive.id)?.operation).toBe(SolidOperation.Additive);
    stack.undo();
    expect(model.findBrush(additive.id)?.operation).toBe(SolidOperation.Additive);
    expect(model.findBrush(subtractive.id)?.operation).toBe(SolidOperation.Subtractive);
  });

  it('flips selected solid CSG groups additive ↔ subtractive', () => {
    const model = new SolidModel('ToggleGroupSolid');
    world.add(model.root);
    const child = model.addBoxBrush(2, SolidOperation.Additive);
    const group = new THREE.Group();
    markAsSolidCsgGroup(group, SolidOperation.Additive);
    model.root.add(group);
    group.add(child.mesh!);
    model.syncBrushOrderFromScene();
    selection.setSelection([child.mesh!], [group]);
    controller.toggleAdditiveSubtractiveOnSelection();
    expect(group.userData['solidGroupOperation']).toBe(SolidOperation.Subtractive);
    stack.undo();
    expect(group.userData['solidGroupOperation']).toBe(SolidOperation.Additive);
  });

  it('flips generator nodes together with brushes in one undo step', () => {
    const model = new SolidModel('ToggleGeneratorSolid');
    world.add(model.root);
    const brush = model.addBoxBrush(2, SolidOperation.Subtractive);
    const node = modifierGeneratorNodeCreate('column');
    model.root.add(node);
    selection.setSelection([brush.mesh!, node]);
    controller.toggleAdditiveSubtractiveOnSelection();
    expect(model.findBrush(brush.id)?.operation).toBe(SolidOperation.Additive);
    expect(modifierGeneratorOperationRead(node)).toBe(SolidOperation.Subtractive);
    stack.undo();
    expect(model.findBrush(brush.id)?.operation).toBe(SolidOperation.Subtractive);
    expect(modifierGeneratorOperationRead(node)).toBe(SolidOperation.Additive);
    stack.redo();
    expect(modifierGeneratorOperationRead(node)).toBe(SolidOperation.Subtractive);
  });

  it('raises the operation flip notification once per generator change, not when unchanged', () => {
    const flipped = vi.spyOn(NotificationGlobal, 'onSolidCsgOperationFlipped');
    const model = new SolidModel('NotifyGeneratorSolid');
    world.add(model.root);
    const node = modifierGeneratorNodeCreate('arch');
    model.root.add(node);
    selection.setSelection([node]);
    controller.toggleAdditiveSubtractiveOnSelection();
    expect(flipped).toHaveBeenCalledTimes(1);
    controller.setBrushOperationForMeshes([node], SolidOperation.Subtractive);
    expect(flipped).toHaveBeenCalledTimes(1);
    stack.undo();
    expect(flipped).toHaveBeenCalledTimes(2);
    flipped.mockRestore();
  });

  it('sets the operation of mixed brush and generator selections from the buttons in one undo step', () => {
    const model = new SolidModel('SetGeneratorSolid');
    world.add(model.root);
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    const node = modifierGeneratorNodeCreate('stairs');
    model.root.add(node);
    controller.setBrushOperationForMeshes([brush.mesh!, node], SolidOperation.Intersecting);
    expect(model.findBrush(brush.id)?.operation).toBe(SolidOperation.Intersecting);
    expect(modifierGeneratorOperationRead(node)).toBe(SolidOperation.Intersecting);
    stack.undo();
    expect(model.findBrush(brush.id)?.operation).toBe(SolidOperation.Additive);
    expect(modifierGeneratorOperationRead(node)).toBe(SolidOperation.Additive);
  });
});
