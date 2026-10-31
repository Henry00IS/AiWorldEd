import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CommandStack } from '@/commands/command_stack.js';
import { HandlerObjectAction } from '@/outliner/hierarchy/handler_object_action.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { markAsSolidCsgGroup } from '@/solid/model/solid_group.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';

describe('HandlerObjectAction grouping selection', () => {
  let world: THREE.Group;
  let commandStack: CommandStack;
  let selectionManager: ManagerSelection;
  let handler: HandlerObjectAction;

  beforeEach(() => {
    world = new THREE.Group();
    world.name = 'World';
    commandStack = new CommandStack(64);
    selectionManager = new ManagerSelection();
    handler = new HandlerObjectAction(world, commandStack, selectionManager);
  });

  it('refuses to delete objects protected by the delete guard', () => {
    const protectedMesh = createNamedMesh('Protected');
    const freeMesh = createNamedMesh('Free');
    world.add(protectedMesh);
    world.add(freeMesh);
    let status = '';
    handler.setShowStatusMessage((message) => {
      status = message;
    });
    handler.setDeleteProtectionGuard((object) => object === protectedMesh);
    selectionManager.setSelection([protectedMesh, freeMesh], [protectedMesh, freeMesh]);
    handler.onDeleteSelected();
    expect(world.children).toContain(protectedMesh);
    expect(world.children).not.toContain(freeMesh);
    expect(status).toContain('Edit Mode');
  });

  /**
   * Builds a mesh with a box geometry and basic material.
   *
   * @param name Mesh name.
   * @returns Created mesh.
   */
  function createNamedMesh(name: string): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.name = name;
    return mesh;
  }

  it('should select the new group after grouping an existing group', () => {
    const innerGroup = new THREE.Group();
    innerGroup.name = 'InnerGroup';
    const childMesh = createNamedMesh('ChildMesh');
    innerGroup.add(childMesh);
    world.add(innerGroup);
    selectionManager.setSelection([childMesh], [innerGroup]);
    handler.groupObjects([innerGroup]);
    const createdGroup = world.children[0] as THREE.Group;
    expect(createdGroup).toBeInstanceOf(THREE.Group);
    expect(createdGroup).not.toBe(innerGroup);
    expect(createdGroup.children).toContain(innerGroup);
    expect(selectionManager.getInspectorObjects()).toEqual([createdGroup]);
    expect(selectionManager.getAllSelectedObjectsAsArray()).toEqual([childMesh]);
  });

  it('should select the new group when grouping multiple meshes', () => {
    const meshA = createNamedMesh('MeshA');
    const meshB = createNamedMesh('MeshB');
    world.add(meshA);
    world.add(meshB);
    selectionManager.setSelection([meshA, meshB], [meshA, meshB]);
    handler.groupObjects([meshA, meshB]);
    const createdGroup = world.children[0] as THREE.Group;
    expect(createdGroup.children).toContain(meshA);
    expect(createdGroup.children).toContain(meshB);
    expect(selectionManager.getInspectorObjects()).toEqual([createdGroup]);
    const selectedMeshes = selectionManager.getAllSelectedObjectsAsArray();
    expect(selectedMeshes).toContain(meshA);
    expect(selectedMeshes).toContain(meshB);
    expect(selectedMeshes).toHaveLength(2);
  });

  it('should select the outer group when nesting a group that already has a child group', () => {
    const leafMesh = createNamedMesh('Leaf');
    const midGroup = new THREE.Group();
    midGroup.name = 'Mid';
    midGroup.add(leafMesh);
    const outerExisting = new THREE.Group();
    outerExisting.name = 'ExistingOuter';
    outerExisting.add(midGroup);
    world.add(outerExisting);
    selectionManager.setSelection([leafMesh], [outerExisting]);
    handler.groupObjects([outerExisting]);
    const newOuter = world.children[0] as THREE.Group;
    expect(newOuter.children).toContain(outerExisting);
    expect(selectionManager.getInspectorObjects()).toEqual([newOuter]);
    expect(selectionManager.getInspectorObjects()[0]).not.toBe(outerExisting);
  });
});

describe('HandlerObjectAction solid group delete', () => {
  let world: THREE.Group;
  let commandStack: CommandStack;
  let selectionManager: ManagerSelection;
  let handler: HandlerObjectAction;

  beforeEach(() => {
    world = new THREE.Group();
    world.name = 'World';
    commandStack = new CommandStack(64);
    selectionManager = new ManagerSelection();
    handler = new HandlerObjectAction(world, commandStack, selectionManager);
  });

  it('unregisters nested solid brushes when deleting a solid CSG group', () => {
    const model = new SolidModel('DeleteGroupSolid');
    world.add(model.root);
    const brushA = model.addBoxBrush(2, SolidOperation.Additive, null, false);
    const brushB = model.addBoxBrush(2, SolidOperation.Additive, null, false);
    brushB.position.set(4, 0, 0);
    brushB.pushTransformToMesh();
    model.markDirty();
    model.rebuild(true);
    const trianglesBefore = resultTriangleCountRead(model);

    const group = new THREE.Group();
    group.name = 'CsgGroup';
    markAsSolidCsgGroup(group);
    model.root.add(group);
    group.add(brushA.mesh!);
    group.add(brushB.mesh!);
    model.syncBrushOrderFromScene();
    model.markDirty();
    model.rebuild(true);

    handler.deleteHierarchyObjects([group]);

    expect(group.parent).toBeNull();
    expect(model.findBrush(brushA.id)).toBeUndefined();
    expect(model.findBrush(brushB.id)).toBeUndefined();
    expect(model.getBrushCount()).toBe(0);
    expect(resultTriangleCountRead(model)).toBeLessThan(trianglesBefore);
    expect(resultTriangleCountRead(model)).toBe(0);
  });

  it('restores group and nested brushes with a single undo', () => {
    const model = new SolidModel('DeleteGroupUndoSolid');
    world.add(model.root);
    const brushA = model.addBoxBrush(2, SolidOperation.Additive, null, false);
    const brushB = model.addBoxBrush(2, SolidOperation.Additive, null, false);
    brushB.position.set(4, 0, 0);
    brushB.pushTransformToMesh();
    const group = new THREE.Group();
    group.name = 'CsgGroup';
    markAsSolidCsgGroup(group);
    model.root.add(group);
    group.add(brushA.mesh!);
    group.add(brushB.mesh!);
    model.syncBrushOrderFromScene();
    model.markDirty();
    model.rebuild(true);
    const trianglesBefore = resultTriangleCountRead(model);

    handler.deleteHierarchyObjects([group]);
    expect(model.getBrushCount()).toBe(0);
    expect(commandStack.canUndo()).toBe(true);

    commandStack.undo();

    expect(group.parent).toBe(model.root);
    expect(group.children).toContain(brushA.mesh!);
    expect(group.children).toContain(brushB.mesh!);
    expect(model.findBrush(brushA.id)).toBeDefined();
    expect(model.findBrush(brushB.id)).toBeDefined();
    expect(model.getBrushCount()).toBe(2);
    expect(resultTriangleCountRead(model)).toBe(trianglesBefore);
    expect(commandStack.canUndo()).toBe(false);
  });

  it('ungroups solid brushes in place under the solid root', () => {
    const model = new SolidModel('UngroupOrderSolid');
    world.add(model.root);
    const first = model.addBoxBrush(2, SolidOperation.Additive, null, false);
    const second = model.addBoxBrush(2, SolidOperation.Additive, null, false);
    const third = model.addBoxBrush(2, SolidOperation.Additive, null, false);
    first.pushTransformToMesh();
    second.pushTransformToMesh();
    third.pushTransformToMesh();
    model.markDirty();
    model.rebuild(true);

    const group = new THREE.Group();
    group.name = 'MiddleGroup';
    markAsSolidCsgGroup(group);
    const firstMesh = first.mesh!;
    const secondMesh = second.mesh!;
    const thirdMesh = third.mesh!;
    model.root.remove(firstMesh);
    model.root.remove(secondMesh);
    model.root.remove(thirdMesh);
    group.add(secondMesh);
    model.root.add(firstMesh);
    model.root.add(group);
    model.root.add(thirdMesh);

    handler.ungroupGroup(group);

    const brushMeshes = model.root.children.filter(
      (child) => child === firstMesh || child === secondMesh || child === thirdMesh,
    );
    expect(brushMeshes).toEqual([firstMesh, secondMesh, thirdMesh]);
    model.syncBrushOrderFromScene();
    expect(model.getBrushes().map((brush) => brush.id)).toEqual([first.id, second.id, third.id]);
  });
});

/**
 * Counts triangles on the compiled solid result mesh.
 *
 * @param model Solid model.
 * @returns Triangle count.
 */
function resultTriangleCountRead(model: SolidModel): number {
  const mesh = model.getResultMesh();
  const index = mesh.geometry.getIndex();
  if (index) {
    return index.count / 3;
  }
  const positions = mesh.geometry.getAttribute('position');
  return positions ? positions.count / 3 : 0;
}

describe('HandlerObjectAction delete selection history', () => {
  let world: THREE.Group;
  let commandStack: CommandStack;
  let selectionManager: ManagerSelection;
  let handler: HandlerObjectAction;

  beforeEach(() => {
    world = new THREE.Group();
    world.name = 'World';
    commandStack = new CommandStack(64);
    selectionManager = new ManagerSelection();
    handler = new HandlerObjectAction(world, commandStack, selectionManager);
  });

  /**
   * Builds a named box mesh under the world.
   *
   * @param name Mesh name.
   * @returns Created mesh.
   */
  function addWorldMesh(name: string): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.name = name;
    world.add(mesh);
    return mesh;
  }

  /**
   * Builds a solid model with two box brushes under the world.
   *
   * @returns Model and its two brush preview meshes.
   */
  function addSolidModelWithTwoBrushes(): { model: SolidModel; meshes: [THREE.Mesh, THREE.Mesh] } {
    const model = new SolidModel('SelectionUndoSolid');
    world.add(model.root);
    const brushA = model.addBoxBrush(2, SolidOperation.Additive, null, false);
    const brushB = model.addBoxBrush(2, SolidOperation.Additive, null, false);
    brushB.position.set(4, 0, 0);
    brushB.pushTransformToMesh();
    model.markDirty();
    model.rebuild(true);
    return { model, meshes: [requireBrushMesh(brushA.mesh), requireBrushMesh(brushB.mesh)] };
  }

  /**
   * Returns a brush preview mesh or fails the test when it is missing.
   *
   * @param mesh Brush preview mesh, if built.
   * @returns The mesh.
   */
  function requireBrushMesh(mesh: THREE.Mesh | null | undefined): THREE.Mesh {
    if (!mesh) throw new Error('brush preview mesh missing');
    return mesh;
  }

  it('restores a multi-object selection when a delete is undone and clears it on redo', () => {
    const meshA = addWorldMesh('A');
    const meshB = addWorldMesh('B');
    addWorldMesh('Unselected');
    selectionManager.setSelection([meshA, meshB], [meshA, meshB]);
    handler.onDeleteSelected();
    expect(selectionManager.getSelectedObjectCount()).toBe(0);
    commandStack.undo();
    expect(world.children).toContain(meshA);
    expect(selectionManager.getAllSelectedObjectsAsArray()).toEqual([meshA, meshB]);
    expect(selectionManager.getInspectorObjects()).toEqual([meshA, meshB]);
    commandStack.redo();
    expect(world.children).not.toContain(meshA);
    expect(selectionManager.getSelectedObjectCount()).toBe(0);
    commandStack.undo();
    expect(selectionManager.getAllSelectedObjectsAsArray()).toEqual([meshA, meshB]);
  });

  it('restores selected solid brushes when their delete is undone', () => {
    const { model, meshes } = addSolidModelWithTwoBrushes();
    selectionManager.setSelection(meshes, meshes);
    handler.onDeleteSelected();
    expect(model.getBrushCount()).toBe(0);
    commandStack.undo();
    expect(model.getBrushCount()).toBe(2);
    expect(selectionManager.getAllSelectedObjectsAsArray()).toEqual(meshes);
    expect(selectionManager.pruneSelectionNotInScene(world)).toBe(false);
  });

  it('restores mixed brush and mesh selection with one undo', () => {
    const {
      meshes: [brushMesh],
    } = addSolidModelWithTwoBrushes();
    const plainMesh = addWorldMesh('Plain');
    selectionManager.setSelection([brushMesh, plainMesh], [brushMesh, plainMesh]);
    handler.onDeleteSelected();
    commandStack.undo();
    expect(commandStack.canUndo()).toBe(false);
    expect(selectionManager.getAllSelectedObjectsAsArray()).toEqual([brushMesh, plainMesh]);
  });

  it('restores a selected solid model root deleted from the outliner', () => {
    const { model, meshes } = addSolidModelWithTwoBrushes();
    selectionManager.setSelection(meshes, [model.root]);
    handler.deleteHierarchyObjects([model.root]);
    expect(model.root.parent).toBeNull();
    expect(selectionManager.getSelectedObjectCount()).toBe(0);
    commandStack.undo();
    expect(model.root.parent).toBe(world);
    expect(selectionManager.getInspectorObjects()).toEqual([model.root]);
    expect(selectionManager.getAllSelectedObjectsAsArray()).toEqual(meshes);
  });

  it('restores a selected group deleted from the outliner', () => {
    const group = new THREE.Group();
    group.name = 'Group';
    const child = addWorldMesh('Child');
    group.add(child);
    world.add(group);
    selectionManager.setSelection([child], [group]);
    handler.deleteHierarchyObjects([group]);
    commandStack.undo();
    expect(group.parent).toBe(world);
    expect(selectionManager.getInspectorObjects()).toEqual([group]);
    expect(selectionManager.getAllSelectedObjectsAsArray()).toEqual([child]);
  });
});
