import type * as THREE from 'three';
import type { PhysicsRapierModule } from '@/physics/rapier/physics_rapier_runtime.js';
import { PhysicsLevelWorld } from '@/physics/level/physics_level_world.js';
import type { PhysicsLevelTrimeshBuffers } from '@/physics/level/physics_level_trimesh.js';
import { PhysicsLevelSceneSync } from '@/physics/level/physics_level_scene_sync.js';
import { physicsLevelSolidColliderKey } from '@/physics/level/physics_level_solid_tracker.js';
import { playerCollisionIsCollidableMesh } from '@/player/collision/player_collision_world.js';
import { SolidModelRegistry } from '@/solid/model/solid_model_registry.js';
import type { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { modifierStackDerivedByRoot } from '@/modifier/stack/evaluate/modifier_stack_compile.js';

/** The modifier step whose own brushes stay out of the fixed world. */
export interface PhysicsShatterLevelOwner {
  /** Uuid of the modifier's volume or node. */
  readonly volumeUuid: string;
  /** Id of the Physics Shatter step. */
  readonly stepId: string;
  /** Every brush the step gathered as an input. */
  readonly inputBrushIds: readonly string[];
}

/**
 * Builds the fixed world the pieces fly through with the same collider
 * construction play mode uses for level geometry: every visible solid's result
 * mesh and collidable scene mesh as trimeshes, players, toys and helpers left
 * out. The modifier's own inputs and pieces are never added. There is no floor
 * or bound: pieces that miss everything fall until the duration ends.
 *
 * @param rapier Loaded Rapier module.
 * @param sceneRoot Scene root.
 * @param owner The modifier step whose inputs and pieces are left out.
 * @returns Level world holding the fixed colliders.
 */
export function physicsShatterLevelWorldBuild(
  rapier: PhysicsRapierModule,
  sceneRoot: THREE.Object3D,
  owner: PhysicsShatterLevelOwner,
): PhysicsLevelWorld {
  const skipped = new Set<string>();
  for (const model of SolidModelRegistry.collectUnder(sceneRoot)) {
    for (const brushId of physicsShatterLevelOwnBrushIds(model, owner)) {
      skipped.add(physicsLevelSolidColliderKey(model.getResultMesh(), brushId));
    }
  }
  const level = new PhysicsShatterLevelWorld(rapier, skipped);
  const sync = new PhysicsLevelSceneSync(level, playerCollisionIsCollidableMesh);
  sync.setRoot(sceneRoot);
  sync.sync();
  return level;
}

/**
 * Level world that never creates the colliders of the modifier's own brushes,
 * so the world, its broad phase included, depends only on what it keeps and the
 * same scene always gives the same simulation.
 */
class PhysicsShatterLevelWorld extends PhysicsLevelWorld {
  private readonly skippedKeys: ReadonlySet<string>;

  /**
   * Creates an empty level world.
   *
   * @param rapier Loaded Rapier module.
   * @param skippedKeys Collider keys never to create.
   */
  constructor(rapier: PhysicsRapierModule, skippedKeys: ReadonlySet<string>) {
    super(rapier);
    this.skippedKeys = skippedKeys;
  }

  /**
   * Creates or replaces a triangle mesh collider unless its key is skipped.
   *
   * @param key Collider key.
   * @param buffers Triangle mesh buffers in the collider's local space.
   * @param position World translation of the collider.
   * @param quaternion World rotation of the collider.
   * @param invertedWorld True when the mesh bounds a carved inverted-world
   *   void.
   */
  override setTrimesh(
    key: string,
    buffers: PhysicsLevelTrimeshBuffers,
    position: THREE.Vector3,
    quaternion: THREE.Quaternion,
    invertedWorld: boolean = false,
  ): void {
    if (!this.skippedKeys.has(key)) super.setTrimesh(key, buffers, position, quaternion, invertedWorld);
  }
}

/**
 * Returns the brushes of a solid that belong to the modifier itself: its inputs
 * and the pieces it outputs. Subtractive brushes it passes through, such as a
 * Blast Hole's cut, stay part of the world.
 *
 * Piece ids carry `#<volume uuid>:<step id>:` (see the shatter output).
 *
 * @param model Solid model.
 * @param owner The modifier step whose inputs and pieces are left out.
 * @returns Brush ids to leave out.
 */
function physicsShatterLevelOwnBrushIds(model: SolidModel, owner: PhysicsShatterLevelOwner): string[] {
  const derived = [...(modifierStackDerivedByRoot.get(model.root)?.values() ?? [])];
  const tag = `#${owner.volumeUuid}:${owner.stepId}:`;
  const output = derived.filter((brush) => brush.id.includes(tag) && brush.operation !== SolidOperation.Subtractive);
  return [...owner.inputBrushIds, ...output.map((brush) => brush.id)];
}
