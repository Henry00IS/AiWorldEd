import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { CommandHierarchyDuplicate } from '@/outliner/commands/command_hierarchy_duplicate.js';
import { createIndependentSolidModelDuplicate } from '@/solid/model/solid_model_duplicate.js';
import { markAsSolidCsgGroup, isSolidCsgGroup } from '@/solid/model/solid_group.js';
import { HandlerObjectAction } from '@/outliner/hierarchy/handler_object_action.js';
import { CommandStack } from '@/commands/command_stack.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';

/** Independent solid model duplication must not share state with the original. */
describe('Duplicate solid model roots', () => {
  it('creates an independent solid model with remapped brush ids', () => {
    const source = buildSolidWithNestedGroup('SourceSolid');
    const sourceBrushIds = source.getBrushes().map((brush) => brush.id);
    const clone = createIndependentSolidModelDuplicate(source, new THREE.Vector3(2, 0, 0));
    expect(clone).not.toBe(source);
    expect(clone.root).not.toBe(source.root);
    expect(SolidModel.isSolidModelObject(clone.root)).toBe(true);
    expect(SolidModel.fromObject(clone.root)).toBe(clone);
    expect(clone.root.name).not.toBe(source.root.name);
    expect(clone.root.name.startsWith('SourceSolid')).toBe(true);
    expect(clone.getBrushCount()).toBe(source.getBrushCount());
    const cloneBrushIds = clone.getBrushes().map((brush) => brush.id);
    for (const cloneId of cloneBrushIds) {
      expect(sourceBrushIds).not.toContain(cloneId);
    }
    expect(clone.root.position.x).toBeCloseTo(source.root.position.x + 2, 5);
    expect(clone.isInvertedWorld()).toBe(source.isInvertedWorld());
  });

  it('preserves nested solid CSG groups under the cloned root', () => {
    const source = buildSolidWithNestedGroup('NestedSource');
    const clone = createIndependentSolidModelDuplicate(source);
    const nestedGroups = clone.root.children.filter((child) => child instanceof THREE.Group && isSolidCsgGroup(child));
    expect(nestedGroups.length).toBe(1);
    const nestedGroup = nestedGroups[0] as THREE.Group;
    const nestedBrushes = nestedGroup.children.filter((child) => child instanceof THREE.Mesh);
    expect(nestedBrushes.length).toBe(2);
    expect(SolidModel.fromObject(nestedBrushes[0]!)).toBe(clone);
  });

  it('duplicates a solid model root via command next to the original', () => {
    const world = new THREE.Group();
    const source = buildSolidWithNestedGroup('CmdSolid');
    source.root.position.set(1, 2, 3);
    world.add(source.root);
    const brushCountBefore = source.getBrushCount();
    const command = new CommandHierarchyDuplicate([source.root], new THREE.Vector3(0, 0, 0));
    command.execute();
    expect(source.getBrushCount()).toBe(brushCountBefore);
    expect(world.children.length).toBe(2);
    const clonedRoots = command.getClones();
    expect(clonedRoots).toHaveLength(1);
    const cloneRoot = clonedRoots[0]!;
    expect(SolidModel.isSolidModelObject(cloneRoot)).toBe(true);
    expect(cloneRoot.parent).toBe(world);
    expect(world.children.indexOf(cloneRoot)).toBe(world.children.indexOf(source.root) + 1);
    const cloneModel = SolidModel.fromObject(cloneRoot);
    expect(cloneModel).toBeTruthy();
    expect(cloneModel!.getBrushCount()).toBe(brushCountBefore);
    expect(cloneRoot.position.x).toBeCloseTo(1, 5);
    expect(cloneRoot.position.y).toBeCloseTo(2, 5);
    expect(cloneRoot.position.z).toBeCloseTo(3, 5);
    expect(cloneModel!.getBrushes().every((brush) => brush.mesh !== null)).toBe(true);
  });

  it('undoes solid model duplication by removing the clone root', () => {
    const world = new THREE.Group();
    const source = buildSolidWithNestedGroup('UndoSolid');
    world.add(source.root);
    const command = new CommandHierarchyDuplicate([source.root], new THREE.Vector3(0, 0, 0));
    command.execute();
    expect(world.children.length).toBe(2);
    const cloneRoot = command.getClones()[0]!;
    command.undo();
    expect(world.children.length).toBe(1);
    expect(world.children[0]).toBe(source.root);
    expect(cloneRoot.parent).toBeNull();
    command.execute();
    expect(world.children[1]).toBe(cloneRoot);
  });

  it('duplicates a selected solid model through the object action handler', () => {
    const world = new THREE.Group();
    const source = buildSolidWithNestedGroup('HandlerSolid');
    world.add(source.root);
    const stack = new CommandStack(64);
    const selection = new ManagerSelection();
    selection.setSelection([], [source.root]);
    const handler = new HandlerObjectAction(world, stack, selection);
    handler.onDuplicateSelected();
    expect(world.children.length).toBe(2);
    const cloneRoot = world.children.find((child) => child !== source.root);
    expect(cloneRoot).toBeTruthy();
    expect(SolidModel.isSolidModelObject(cloneRoot!)).toBe(true);
    const cloneModel = SolidModel.fromObject(cloneRoot!);
    expect(cloneModel).toBeTruthy();
    expect(cloneModel).not.toBe(source);
    expect(cloneModel!.getBrushCount()).toBe(source.getBrushCount());
    expect(source.getBrushCount()).toBe(3);
  });

  it('preserves inverted-world flag on independent duplicates', () => {
    const source = new SolidModel('InvertedSource');
    source.addBoxBrush(4, SolidOperation.Additive);
    source.addBoxBrush(2, SolidOperation.Subtractive);
    source.setInvertedWorld(true);
    const clone = createIndependentSolidModelDuplicate(source);
    expect(clone.isInvertedWorld()).toBe(true);
    expect(source.isInvertedWorld()).toBe(true);
  });
});

/**
 * Builds a solid model with one root brush and a nested CSG group of two
 * brushes.
 *
 * @param name Solid model display name.
 * @returns Configured solid model not parented to a world.
 */
function buildSolidWithNestedGroup(name: string): SolidModel {
  const model = new SolidModel(name);
  model.addBoxBrush(4, SolidOperation.Additive);
  const nestedA = model.addBoxBrush(2, SolidOperation.Subtractive);
  const nestedB = model.addBoxBrush(2, SolidOperation.Additive);
  const group = new THREE.Group();
  group.name = 'Compound';
  markAsSolidCsgGroup(group);
  model.root.add(group);
  group.add(nestedA.mesh!);
  group.add(nestedB.mesh!);
  model.syncBrushOrderFromScene();
  model.rebuild(true);
  return model;
}
