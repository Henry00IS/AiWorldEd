import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PlayerCollisionWorld } from '@/player/collision/player_collision_world.js';
import {
  createPlayerCollisionScratch,
  playerCollisionIntegrateStep,
  type PlayerCollisionScratch,
} from '@/player/collision/player_collision_resolve.js';
import { PLAYER_COLLIDER_HEIGHT_METERS, PLAYER_COLLIDER_RADIUS_METERS } from '@/player/player_constants.js';
import { PhysicsRapierRuntime } from '@/physics/rapier/physics_rapier_runtime.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';

const frameSeconds = 1 / 60;
const noIntent = new THREE.Vector3();

/**
 * Builds a box mesh at the given world center with the given size.
 *
 * @param center World center.
 * @param size Box size.
 * @returns Mesh ready for collision.
 */
function createBoxMesh(center: THREE.Vector3, size: THREE.Vector3): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z));
  mesh.position.copy(center);
  mesh.updateMatrixWorld(true);
  return mesh;
}

/**
 * Creates a collision world over a root holding a wide floor whose top is y=0.
 *
 * @returns Root group and collision world.
 */
function createFloorWorld(): { root: THREE.Group; world: PlayerCollisionWorld } {
  const root = new THREE.Group();
  root.add(createBoxMesh(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(40, 1, 40)));
  const world = new PlayerCollisionWorld();
  world.activate();
  world.setWorldRoot(root);
  return { root, world };
}

/**
 * Adds a mesh to the scene and tells collision the scene changed.
 *
 * @param root Scene root.
 * @param world Collision world.
 * @param mesh Mesh to add.
 */
function addLiveMesh(root: THREE.Group, world: PlayerCollisionWorld, mesh: THREE.Mesh): void {
  root.add(mesh);
  world.invalidateMeshCache();
}

/**
 * Runs integration frames with a constant horizontal step.
 *
 * @param world Collision world.
 * @param feet Feet position mutated in place.
 * @param scratch Per-body scratch.
 * @param frames Frame count.
 * @param horizontal Horizontal displacement per frame.
 * @param verticalVelocity Starting vertical velocity.
 * @returns Final vertical velocity.
 */
function runFrames(
  world: PlayerCollisionWorld,
  feet: THREE.Vector3,
  scratch: PlayerCollisionScratch,
  frames: number,
  horizontal: THREE.Vector3,
  verticalVelocity: number,
): number {
  let velocity = verticalVelocity;
  for (let frame = 0; frame < frames; frame++) {
    const intent = horizontal.lengthSq() > 0 ? horizontal.clone().normalize() : noIntent;
    const result = playerCollisionIntegrateStep(
      world,
      feet,
      horizontal,
      velocity - 9.81 * frameSeconds,
      frameSeconds,
      scratch,
      intent,
      scratch.result.isGrounded,
    );
    velocity = result.verticalVelocity;
  }
  return velocity;
}

describe('player collision under live edits', () => {
  beforeAll(async () => {
    await PhysicsRapierRuntime.ensureLoaded();
  });

  it('is blocked by a wall inserted right before the move', () => {
    const { root, world } = createFloorWorld();
    const scratch = createPlayerCollisionScratch();
    const feet = new THREE.Vector3(0, 0, 0);
    runFrames(world, feet, scratch, 5, noIntent, 0);
    addLiveMesh(root, world, createBoxMesh(new THREE.Vector3(1.5, 1.5, 0), new THREE.Vector3(1, 3, 6)));
    runFrames(world, feet, scratch, 1, new THREE.Vector3(2, 0, 0), 0);
    expect(feet.x).toBeLessThan(1 - PLAYER_COLLIDER_RADIUS_METERS + 0.02);
  });

  it('falls once the floor under the player is removed', () => {
    const root = new THREE.Group();
    const floor = createBoxMesh(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(4, 1, 4));
    root.add(floor);
    const world = new PlayerCollisionWorld();
    world.activate();
    world.setWorldRoot(root);
    const scratch = createPlayerCollisionScratch();
    const feet = new THREE.Vector3(0, 0, 0);
    runFrames(world, feet, scratch, 5, noIntent, 0);
    expect(scratch.result.isGrounded).toBe(true);
    root.remove(floor);
    world.invalidateMeshCache();
    runFrames(world, feet, scratch, 20, noIntent, 0);
    expect(scratch.result.isGrounded).toBe(false);
    expect(feet.y).toBeLessThan(-0.3);
  });

  it('stops upward motion at a ceiling without sticking to it', () => {
    const { root, world } = createFloorWorld();
    const ceilingBottom = PLAYER_COLLIDER_HEIGHT_METERS + 0.3;
    addLiveMesh(root, world, createBoxMesh(new THREE.Vector3(0, ceilingBottom + 0.1, 0), new THREE.Vector3(6, 0.2, 6)));
    const scratch = createPlayerCollisionScratch();
    const feet = new THREE.Vector3(0, 0, 0);
    runFrames(world, feet, scratch, 5, noIntent, 0);
    let velocity = 6;
    let framesRising = 0;
    let highestFeet = feet.y;
    while (velocity > 0 && framesRising < 60) {
      velocity = runFrames(world, feet, scratch, 1, noIntent, velocity);
      highestFeet = Math.max(highestFeet, feet.y);
      framesRising++;
    }
    expect(framesRising).toBeLessThan(15);
    expect(highestFeet + PLAYER_COLLIDER_HEIGHT_METERS).toBeLessThanOrEqual(ceilingBottom + 0.001);
    runFrames(world, feet, scratch, 60, noIntent, velocity);
    expect(feet.y).toBeCloseTo(0, 1);
    expect(scratch.result.isGrounded).toBe(true);
  });

  it('lifts the player onto a low block that appears under the feet', () => {
    const { root, world } = createFloorWorld();
    const scratch = createPlayerCollisionScratch();
    const feet = new THREE.Vector3(0, 0, 0);
    runFrames(world, feet, scratch, 5, noIntent, 0);
    addLiveMesh(root, world, createBoxMesh(new THREE.Vector3(0, 0.25, 0), new THREE.Vector3(2, 0.5, 2)));
    runFrames(world, feet, scratch, 30, noIntent, 0);
    expect(feet.y).toBeGreaterThan(0.45);
    expect(feet.y).toBeLessThan(0.6);
    expect(scratch.result.isGrounded).toBe(true);
  });

  it('never leaves the player inside a large block that appears on top of them', () => {
    const { root, world } = createFloorWorld();
    const scratch = createPlayerCollisionScratch();
    const feet = new THREE.Vector3(0, 0, 0);
    runFrames(world, feet, scratch, 5, noIntent, 0);
    addLiveMesh(root, world, createBoxMesh(new THREE.Vector3(0, 2, 0), new THREE.Vector3(6, 4, 6)));
    runFrames(world, feet, scratch, 60, noIntent, 0);
    const insideBlock = feet.y > -0.01 && feet.y < 4 - 0.01 && Math.abs(feet.x) < 3 && Math.abs(feet.z) < 3;
    expect(insideBlock).toBe(false);
    expect(feet.y).toBeGreaterThan(-0.5);
  });

  it('follows a solid brush edit through the per-brush collision chunks', () => {
    const model = new SolidModel('EditSolid');
    const floorBrush = model.addBoxBrush(8, SolidOperation.Additive, null, false);
    floorBrush.mesh?.position.set(0, -4, 0);
    model.syncBrushOrderFromScene();
    model.rebuild(true);
    const root = new THREE.Group();
    root.add(model.root);
    root.updateMatrixWorld(true);
    const world = new PlayerCollisionWorld();
    world.activate();
    world.setWorldRoot(root);
    const before = world.raycastNearest(new THREE.Vector3(0, 5, 0), new THREE.Vector3(0, -1, 0), 20);
    expect(before?.point.y).toBeCloseTo(0, 2);
    const stepBrush = model.addBoxBrush(1, SolidOperation.Additive, null, false);
    stepBrush.mesh?.position.set(0, 0.5, 0);
    model.syncBrushOrderFromScene();
    model.rebuild(true);
    root.updateMatrixWorld(true);
    const after = world.raycastNearest(new THREE.Vector3(0, 5, 0), new THREE.Vector3(0, -1, 0), 20);
    expect(after?.point.y).toBeCloseTo(1, 2);
    expect(after?.colliderKey).toContain(stepBrush.id);
  });
});
