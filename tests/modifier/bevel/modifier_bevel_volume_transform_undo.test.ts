import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CommandTransformTranslate } from '@/transform/commands/command_transform_translate.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';

describe('bevel volume transform undo', () => {
  it('drops and restores the chamfer when a volume move is undone and redone', () => {
    const { world, model, volume, plainVertexCount } = sceneWithBeveledBrush();
    const beveled = resultVertexCount(model);
    const command = new CommandTransformTranslate(
      [{ object: volume, position: volume.position.clone(), finalPosition: new THREE.Vector3(20, 0, 0) }],
      new THREE.Vector3(),
    );
    command.execute();
    modifierBevelRefreshScene(world);
    expect(resultVertexCount(model)).toBe(plainVertexCount);
    command.undo();
    SolidModel.refreshAfterHistoryChange(world);
    expect(resultVertexCount(model)).toBe(beveled);
    command.execute();
    SolidModel.refreshAfterHistoryChange(world);
    expect(resultVertexCount(model)).toBe(plainVertexCount);
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
  const model = new SolidModel('BevelTransformUndo');
  world.add(model.root);
  model.addBoxBrush(1, SolidOperation.Additive);
  const plainVertexCount = resultVertexCount(model);
  const volume = ModifierVolumeBevel.create();
  volume.scale.set(4, 4, 4);
  world.add(volume);
  world.updateMatrixWorld(true);
  modifierBevelRefreshScene(world);
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
