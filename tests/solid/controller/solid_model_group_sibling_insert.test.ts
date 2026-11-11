import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModelController } from '@/solid/controller/solid_model_controller.js';
import { CommandStack } from '@/commands/command_stack.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { markAsSolidCsgGroup } from '@/solid/model/solid_group.js';
import { collectMeshesUnder } from '@/utils/utils_hierarchy.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';

/** Lightweight panel stand-in for insertion tests. */
class MockSolidPanel {
  private model: SolidModel | null = null;

  setModel(model: SolidModel | null): void {
    this.model = model;
  }

  getModel(): SolidModel | null {
    return this.model;
  }

  refresh(): void {
    return;
  }

  isOpen(): boolean {
    return true;
  }

  toggle(): void {
    return;
  }
}

/**
 * Scene with a root brush, a CSG group holding one brush, and a trailing root
 * brush.
 */
interface GroupScene {
  world: THREE.Group;
  selection: ManagerSelection;
  commands: CommandStack;
  controller: SolidModelController;
  model: SolidModel;
  group: THREE.Group;
}

/**
 * Builds a solid model whose root holds: brush, group (with one brush), brush.
 *
 * @param nestGroup When true, the selected group sits inside an outer group.
 * @returns Scene parts.
 */
function groupSceneCreate(nestGroup: boolean = false): GroupScene {
  const world = new THREE.Group();
  const selection = new ManagerSelection();
  const commands = new CommandStack(16);
  const controller = new SolidModelController(world, commands, selection, new MockSolidPanel() as never);
  const model = new SolidModel('GroupSibling');
  world.add(model.root);
  model.addBoxBrush(4, SolidOperation.Additive);
  const inner = model.addBoxBrush(2, SolidOperation.Additive);
  const trailing = model.addBoxBrush(1, SolidOperation.Subtractive);
  const group = new THREE.Group();
  markAsSolidCsgGroup(group);
  const holder = nestGroup ? new THREE.Group() : model.root;
  if (nestGroup) {
    markAsSolidCsgGroup(holder);
    model.root.add(holder);
  }
  holder.add(group);
  group.add(inner.mesh as THREE.Mesh);
  model.root.add(trailing.mesh as THREE.Mesh);
  model.syncBrushOrderFromScene();
  return { world, selection, commands, controller, model, group };
}

/**
 * Selects a group the way the outliner does: its meshes plus the group as the
 * inspector object.
 *
 * @param scene Scene parts.
 */
function groupSelect(scene: GroupScene): void {
  scene.selection.setSelection(collectMeshesUnder(scene.group), [scene.group]);
}

/**
 * Returns the child that directly follows the group under its parent.
 *
 * @param group Selected group.
 * @returns Next sibling, or undefined.
 */
function siblingAfterGroup(group: THREE.Object3D): THREE.Object3D | undefined {
  const parent = group.parent as THREE.Object3D;
  return parent.children[parent.children.indexOf(group) + 1];
}

/** New brushes and generators beside a selected CSG group instead of inside it. */
describe('Solid model insert beside a selected group', () => {
  it('adds a box brush right after the selected group, not inside it', () => {
    const scene = groupSceneCreate();
    const groupChildCount = scene.group.children.length;
    groupSelect(scene);
    scene.controller.addBoxBrush();
    const created = scene.selection.getLastSelectedObject();
    expect(scene.model.getBrushCount()).toBe(4);
    expect(scene.group.children.length).toBe(groupChildCount);
    expect(created?.parent).toBe(scene.model.root);
    expect(siblingAfterGroup(scene.group)).toBe(created);
  });

  it('keeps the slot after the group through undo and redo', () => {
    const scene = groupSceneCreate();
    groupSelect(scene);
    scene.controller.addBoxBrush();
    const created = scene.selection.getLastSelectedObject();
    scene.commands.undo();
    expect(scene.model.getBrushCount()).toBe(3);
    expect(created?.parent).toBeNull();
    scene.commands.redo();
    expect(scene.model.getBrushCount()).toBe(4);
    expect(siblingAfterGroup(scene.group)).toBe(created);
    const order = scene.model.getBrushes().map((brush) => brush.mesh);
    expect(order.indexOf(created as THREE.Mesh)).toBe(2);
  });

  it('stays inside the outer group when the selected group is nested', () => {
    const scene = groupSceneCreate(true);
    const outer = scene.group.parent as THREE.Object3D;
    groupSelect(scene);
    scene.controller.addBoxBrush();
    const created = scene.selection.getLastSelectedObject();
    expect(created?.parent).toBe(outer);
    expect(siblingAfterGroup(scene.group)).toBe(created);
  });

  it('adds a generator right after the selected group and undoes cleanly', () => {
    const scene = groupSceneCreate();
    groupSelect(scene);
    scene.controller.addGenerator('stairs');
    const node = siblingAfterGroup(scene.group);
    expect(node && ModifierVolume.isVolume(node)).toBe(true);
    expect(scene.group.children.some((child) => ModifierVolume.isVolume(child))).toBe(false);
    scene.commands.undo();
    expect(node?.parent).toBeNull();
    scene.commands.redo();
    expect(siblingAfterGroup(scene.group)).toBe(node);
  });

  it('still adds inside the group when a brush in the group is selected', () => {
    const scene = groupSceneCreate();
    const inner = scene.group.children[0] as THREE.Mesh;
    scene.selection.selectObject(inner);
    scene.controller.addBoxBrush();
    const created = scene.selection.getLastSelectedObject();
    expect(created?.parent).toBe(scene.group);
  });
});
