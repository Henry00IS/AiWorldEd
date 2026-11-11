import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CommandStack } from '@/commands/command_stack.js';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierGeneratorOperationCommand } from '@/modifier/stack/modifier_generator_operation.js';
import { modifierVolumeTemplateCreate } from '@/modifier/stack/modifier_volume_templates.js';
import { HandlerHierarchyReparent } from '@/outliner/hierarchy/handler_hierarchy_reparent.js';
import { CommandSolidBrushesReorder } from '@/solid/commands/brushes/command_solid_brushes_reorder.js';
import { markAsSolidCsgGroup } from '@/solid/model/solid_group.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';

/** Inside the world box and inside the column. */
const PROBE = new THREE.Vector3(0.05, 0.3, 0.03);

/**
 * Builds a world with a solid holding a 4-unit additive box, a CSG group with a
 * small brush, and a subtractive Column generator after them.
 *
 * @returns Scene pieces and a reparent handler with its status messages.
 */
function scene() {
  const world = new THREE.Group();
  const model = new SolidModel('Reparent generator');
  world.add(model.root);
  const box = model.addBoxBrush(4, SolidOperation.Additive).mesh!;
  const group = new THREE.Group();
  group.name = 'Group';
  markAsSolidCsgGroup(group, SolidOperation.Additive);
  model.root.add(group);
  model.addBoxBrush(0.5, SolidOperation.Additive, group).mesh!.position.set(1.5, 1.5, 1.5);
  const generator = modifierGeneratorNodeCreate('column');
  generator.scale.set(1, 1, 1);
  model.root.add(generator);
  modifierGeneratorOperationCommand(generator, SolidOperation.Subtractive)?.execute();
  world.updateMatrixWorld(true);
  model.markDirty();
  modifierBevelRefreshScene(world);
  model.rebuild(true);
  const stack = new CommandStack(32);
  const handler = new HandlerHierarchyReparent(world, stack);
  const status: string[] = [];
  handler.setShowStatus((message) => status.push(message));
  return { world, model, box, group, generator, stack, handler, status };
}

/**
 * Returns whether a model-space point lies inside the solid's result mesh.
 *
 * @param model Solid model.
 * @returns True inside.
 */
function solidAtProbe(model: SolidModel): boolean {
  const mesh = new THREE.Mesh(model.getResultMesh().geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const ray = new THREE.Raycaster(PROBE, new THREE.Vector3(1, 0.1234, 0.0567).normalize());
  return ray.intersectObject(mesh).length % 2 === 1;
}

/**
 * Undoes like the editor does: the command, then the history refresh.
 *
 * @param stack Undo stack.
 * @param world Scene world.
 */
function undo(stack: CommandStack, world: THREE.Object3D): void {
  stack.undo();
  SolidModel.refreshAfterHistoryChange(world);
}

describe('outliner moves of generator and volume nodes', () => {
  it('drops a generator into a CSG group of its model, rebuilding the CSG, with undo', () => {
    const { world, model, group, generator, stack, handler } = scene();
    expect(solidAtProbe(model)).toBe(false);
    handler.reparentFromDrop(generator, group, 'into');
    expect(generator.parent).toBe(group);
    expect(solidAtProbe(model)).toBe(true);
    undo(stack, world);
    expect(generator.parent).toBe(model.root);
    expect(solidAtProbe(model)).toBe(false);
    stack.redo();
    SolidModel.refreshAfterHistoryChange(world);
    expect(generator.parent).toBe(group);
    expect(solidAtProbe(model)).toBe(true);
  });

  it('reorders a generator among its siblings, which moves its pieces in the CSG order', () => {
    const { world, model, box, group, generator, stack, handler } = scene();
    handler.reparentFromDrop(generator, box, 'before');
    expect(model.root.children.indexOf(generator)).toBeLessThan(model.root.children.indexOf(box));
    expect(solidAtProbe(model)).toBe(true);
    handler.reparentFromDrop(generator, box, 'after');
    const order = model.root.children.filter((child) => child === box || child === group || child === generator);
    expect(order).toEqual([box, generator, group]);
    expect(solidAtProbe(model)).toBe(false);
    undo(stack, world);
    expect(model.root.children.indexOf(generator)).toBeLessThan(model.root.children.indexOf(box));
    expect(solidAtProbe(model)).toBe(true);
  });

  it('never lets a generator leave its solid model', () => {
    const { world, model, generator, handler, status } = scene();
    const other = new SolidModel('Other');
    world.add(other.root);
    const crate = new THREE.Mesh(new THREE.BoxGeometry());
    world.add(crate);
    handler.reparentFromDrop(generator, world, 'into');
    handler.reparentFromDrop(generator, crate, 'after');
    handler.reparentFromDrop(generator, other.root, 'into');
    handler.reparentFromDrop(generator, model.root, 'before');
    expect(generator.parent).toBe(model.root);
    expect(status.at(-1)).toMatch(/must stay under their solid model/);
  });

  it('moves a generator to first and last among its siblings with To First and To Last', () => {
    const { world, model, box, generator, stack } = scene();
    stack.push(new CommandSolidBrushesReorder([generator], 'first'));
    expect(model.root.children.indexOf(generator)).toBeLessThan(model.root.children.indexOf(box));
    expect(solidAtProbe(model)).toBe(true);
    undo(stack, world);
    expect(model.root.children.indexOf(generator)).toBeGreaterThan(model.root.children.indexOf(box));
    expect(solidAtProbe(model)).toBe(false);
  });

  it('lets a modifier volume move into a solid tree and back to the world', () => {
    const { world, model, group, handler } = scene();
    const volume = modifierVolumeTemplateCreate('bevel');
    world.add(volume);
    handler.reparentFromDrop(volume, group, 'into');
    expect(volume.parent).toBe(group);
    handler.reparentFromDrop(volume, model.root, 'before');
    expect(volume.parent).toBe(world);
  });
});
