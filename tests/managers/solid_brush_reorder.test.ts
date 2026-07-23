import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { HierarchyReparentHandler } from '../../src/managers/hierarchy_reparent_handler.js';
import { CommandStack } from '../../src/commands/command_stack.js';
import { SolidModel } from '../../src/solid/model/solid_model.js';
import { SolidOperation } from '../../src/solid/types/solid_operation.js';

/**
 * Outliner reparent must change solid CSG evaluation order.
 */
describe('Solid brush outliner reorder', () => {
  it('rebuilds without cavity when subtractive is moved before additive', () => {
    const world = new THREE.Group();
    const stack = new CommandStack(16);
    const handler = new HierarchyReparentHandler(world, stack);
    const model = new SolidModel('SolidReorder');
    world.add(model.root);
    const additive = model.addBoxBrush(4, SolidOperation.Additive);
    const subtractive = model.addBoxBrush(2, SolidOperation.Subtractive);
    model.rebuild(true);
    const holeVertexCount =
      model.getResultMesh().geometry.getAttribute('position').count;
    expect(holeVertexCount).toBeGreaterThan(0);
    // Drop subtractive onto additive → insert before → first in CSG order.
    handler.reparentFromDrop(subtractive.mesh!, additive.mesh!);
    expect(model.getBrushes().map((b) => b.operation)).toEqual([
      SolidOperation.Subtractive,
      SolidOperation.Additive
    ]);
    const solidVertexCount =
      model.getResultMesh().geometry.getAttribute('position').count;
    expect(solidVertexCount).toBeLessThan(holeVertexCount);
  });

  it('rejects moving a solid brush out of its solid model root', () => {
    const world = new THREE.Group();
    const stack = new CommandStack(16);
    const handler = new HierarchyReparentHandler(world, stack);
    const model = new SolidModel('SolidStay');
    world.add(model.root);
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    const outside = new THREE.Group();
    outside.name = 'Outside';
    world.add(outside);
    handler.reparentFromDrop(brush.mesh!, outside);
    expect(brush.mesh!.parent).toBe(model.root);
    expect(model.getBrushCount()).toBe(1);
    expect(stack.getUndoCount()).toBe(0);
  });

  it('rejects parenting a non-brush object under a solid model root', () => {
    const world = new THREE.Group();
    const stack = new CommandStack(16);
    const handler = new HierarchyReparentHandler(world, stack);
    const model = new SolidModel('SolidNoGuest');
    world.add(model.root);
    model.addBoxBrush(2, SolidOperation.Additive);
    const guest = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial()
    );
    world.add(guest);
    handler.reparentFromDrop(guest, model.root);
    expect(guest.parent).toBe(world);
    expect(stack.getUndoCount()).toBe(0);
  });
});
