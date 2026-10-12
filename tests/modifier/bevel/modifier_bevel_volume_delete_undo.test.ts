import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CommandStack } from '@/commands/command_stack.js';
import { CommandObjectDelete, type DeleteSnapshot } from '@/outliner/commands/command_object_delete.js';
import { CommandObjectHierarchyDelete } from '@/outliner/commands/command_object_hierarchy_delete.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';

describe('bevel volume delete undo', () => {
  it('drops and restores the chamfer when a hierarchy delete is undone and redone', () => {
    const { model, volume, plainVertexCount } = sceneWithBeveledBrush();
    const command = new CommandObjectHierarchyDelete([volume]);
    command.execute();
    expect(resultVertexCount(model)).toBe(plainVertexCount);
    command.undo();
    expect(resultVertexCount(model)).toBeGreaterThan(plainVertexCount);
    command.execute();
    expect(resultVertexCount(model)).toBe(plainVertexCount);
  });

  it('drops and restores the chamfer when an object delete is undone through the stack', () => {
    const { world, model, volume, plainVertexCount } = sceneWithBeveledBrush();
    const plain = plainVertexCount;
    const stack = new CommandStack(8);
    stack.push(new CommandObjectDelete([deleteSnapshot(volume)]));
    expect(resultVertexCount(model)).toBe(plain);
    expect(volume.parent).toBeNull();
    stack.undo();
    expect(volume.parent).toBe(world);
    expect(resultVertexCount(model)).toBeGreaterThan(plain);
    stack.redo();
    expect(volume.parent).toBeNull();
    expect(resultVertexCount(model)).toBe(plain);
  });
});

/**
 * Builds a world with one solid brush covered by a bevel volume.
 *
 * @returns World, model, volume, and the unbeveled result vertex count.
 */
function sceneWithBeveledBrush(): {
  world: THREE.Group;
  model: SolidModel;
  volume: THREE.Mesh;
  plainVertexCount: number;
} {
  const world = new THREE.Group();
  const model = new SolidModel('BevelUndo');
  world.add(model.root);
  model.addBoxBrush(1, SolidOperation.Additive);
  const plainVertexCount = resultVertexCount(model);
  const volume = ModifierVolumeBevel.create();
  volume.scale.set(4, 4, 4);
  world.add(volume);
  world.updateMatrixWorld(true);
  modifierBevelRefreshScene(world);
  expect(resultVertexCount(model)).toBeGreaterThan(plainVertexCount);
  return { world, model, volume, plainVertexCount };
}

/**
 * Counts result-mesh vertices.
 *
 * @param model Solid model.
 * @returns Position attribute count.
 */
function resultVertexCount(model: SolidModel): number {
  const position = model.getResultMesh().geometry.getAttribute('position');
  return position?.count ?? 0;
}

/**
 * Captures a delete snapshot for a volume that is still parented.
 *
 * @param volume Bevel volume.
 * @returns Snapshot for CommandObjectDelete.
 */
function deleteSnapshot(volume: THREE.Mesh): DeleteSnapshot {
  return {
    mesh: volume,
    parent: volume.parent,
    siblingIndex: volume.parent ? volume.parent.children.indexOf(volume) : 0,
    position: volume.position.clone(),
    rotation: volume.quaternion.clone(),
    scale: volume.scale.clone(),
    name: volume.name,
    geometry: volume.geometry,
    material: volume.material as THREE.Material,
  };
}
