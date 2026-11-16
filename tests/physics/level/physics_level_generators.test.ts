import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';
import { MODIFIER_STACK_SOLID_SCRIPT_KIND } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierStackParametersCommit } from '@/modifier/stack/modifier_stack_parameters_commit.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { physicsShatterLevelWorldBuild } from '@/modifier/stack/kinds/shatter/sim/physics_shatter_sim_level.js';
import { PhysicsLevelSceneSync } from '@/physics/level/physics_level_scene_sync.js';
import { PhysicsLevelWorld } from '@/physics/level/physics_level_world.js';
import { PhysicsRapierRuntime, type PhysicsRapierModule } from '@/physics/rapier/physics_rapier_runtime.js';
import { playerCollisionIsCollidableMesh } from '@/player/collision/player_collision_world.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';

let rapier: PhysicsRapierModule;

/**
 * Adds a generator node at a spot of the solid.
 *
 * @param model Solid.
 * @param kind Generator kind.
 * @param x X of the node.
 * @returns Node.
 */
function generatorAdd(model: SolidModel, kind: string, x: number): THREE.Object3D {
  const node = modifierGeneratorNodeCreate(kind);
  node.position.set(x, 0, 0);
  node.scale.set(1, 1, 1);
  model.root.add(node);
  return node;
}

/**
 * Gives a SolidScript generator node its lines.
 *
 * @param node Node.
 * @param lines Lines.
 */
function scriptSet(node: THREE.Object3D, lines: SolidScriptLine[]): void {
  const stepId = ModifierVolume.read(node).modifiers[0]?.id ?? '';
  modifierStackParametersCommit(node, stepId, { script: solidScriptDocumentCreate(lines, 'Test') }, null);
}

/**
 * Returns whether a ray straight down onto x hits a level collider.
 *
 * @param level Level world.
 * @param x X.
 * @returns True on a hit.
 */
function hitAt(level: PhysicsLevelWorld, x: number): boolean {
  return level.castRay(new THREE.Vector3(x, 5, 0), new THREE.Vector3(0, -1, 0), 10) !== null;
}

describe('Physics level generators', () => {
  beforeAll(async () => {
    rapier = await PhysicsRapierRuntime.ensureLoaded();
  });

  it('collides with what SolidScript generators build, brushes and meshes, in play and in Physics Shatter', () => {
    const world = new THREE.Group();
    const model = new SolidModel('Level');
    world.add(model.root);
    model.addBoxBrush(1, SolidOperation.Additive).mesh!.position.set(-20, 0, 0);
    generatorAdd(model, 'column', 0);
    scriptSet(generatorAdd(model, MODIFIER_STACK_SOLID_SCRIPT_KIND, 5), [{ command: 'cube' }]);
    scriptSet(generatorAdd(model, MODIFIER_STACK_SOLID_SCRIPT_KIND, 10), [
      { command: 'curve_to_mesh', values: { path: '-1, 0, 0; 1, 0, 0', radius: '0.3', mesh: 'true' } },
    ]);
    world.updateMatrixWorld(true);
    model.markDirty();
    modifierBevelRefreshScene(world);
    model.rebuild(true);
    world.updateMatrixWorld(true);
    const play = new PhysicsLevelWorld(rapier);
    const sync = new PhysicsLevelSceneSync(play, playerCollisionIsCollidableMesh);
    sync.setRoot(world);
    sync.sync();
    // Physics Shatter flies its pieces through the same level colliders.
    const shatter = physicsShatterLevelWorldBuild(rapier, world, { volumeUuid: '', stepId: '', inputBrushIds: [] });
    for (const level of [play, shatter]) {
      expect([hitAt(level, -20), hitAt(level, 0), hitAt(level, 5), hitAt(level, 10), hitAt(level, 15)]).toEqual([
        true,
        true,
        true,
        true,
        false,
      ]);
      level.dispose();
    }
  });
});
