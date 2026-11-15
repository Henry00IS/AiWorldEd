import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PlayerCollisionWorld } from '@/player/collision/player_collision_world.js';
import {
  createPlayerCollisionScratch,
  playerCollisionIntegrateStep,
} from '@/player/collision/player_collision_resolve.js';
import {
  playerCollisionCapsuleCenterBuried,
  playerCollisionDepenetrate,
} from '@/player/collision/player_collision_depenetration.js';
import { PLAYER_COLLIDER_HEIGHT_METERS } from '@/player/player_constants.js';
import { getDefaultPerspectiveCameraPosition } from '@/navigation/placement/default_camera_placement.js';
import { playerSpawnResolveFeetUnderCamera } from '@/player/spawn/player_spawn_ground.js';
import { PhysicsRapierRuntime } from '@/physics/rapier/physics_rapier_runtime.js';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';

/**
 * Builds an inverted-world solid with one subtractive room centered on the
 * origin.
 *
 * @param width Room size along X.
 * @param height Room size along Y.
 * @param depth Room size along Z.
 * @returns Compiled solid model.
 */
function createInvertedRoom(width: number, height: number, depth: number): SolidModel {
  const model = new SolidModel('InvertedRoom');
  const instance = new SolidBrushInstance(
    'room',
    'Room',
    SolidBrushFactory.createCenteredBox(width, height, depth),
    SolidOperation.Subtractive,
  );
  model.addBrushInstance(instance);
  model.setInvertedWorld(true);
  model.root.updateMatrixWorld(true);
  return model;
}

/**
 * Activates a collision world over a compiled solid model.
 *
 * @param model Solid model already parented or not.
 * @returns Root, collision world, and the model's vertical half-extent.
 */
function createWorldForModel(model: SolidModel): { root: THREE.Group; world: PlayerCollisionWorld } {
  const root = new THREE.Group();
  root.add(model.root);
  root.updateMatrixWorld(true);
  const world = new PlayerCollisionWorld();
  world.activate();
  world.setWorldRoot(root);
  return { root, world };
}

const frameSeconds = 1 / 60;
const gravityMetersPerSecondSquared = 9.81;

/**
 * Builds a perspective camera at a world position, looking at a target.
 *
 * @param position Camera world position.
 * @param target Look-at point.
 * @returns Camera ready for spawn resolution.
 */
function createLookAtCamera(position: THREE.Vector3, target: THREE.Vector3): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  camera.position.copy(position);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  return camera;
}

/**
 * Spawns under a camera and steps play collision with gravity for a few frames.
 *
 * @param world Collision world.
 * @param camera Spawn camera.
 * @param frames Integration frames after spawn.
 * @returns Feet position after the last frame.
 */
function spawnAndStepPlayCollision(
  world: PlayerCollisionWorld,
  camera: THREE.PerspectiveCamera,
  frames: number,
): THREE.Vector3 {
  const feet = new THREE.Vector3();
  playerSpawnResolveFeetUnderCamera(camera, world, feet);
  const scratch = createPlayerCollisionScratch();
  let verticalVelocity = 0;
  for (let frame = 0; frame < frames; frame++) {
    const result = playerCollisionIntegrateStep(
      world,
      feet,
      new THREE.Vector3(),
      verticalVelocity - gravityMetersPerSecondSquared * frameSeconds,
      frameSeconds,
      scratch,
      null,
      scratch.result.isGrounded,
    );
    verticalVelocity = result.verticalVelocity;
  }
  return feet;
}

/**
 * Asserts that the feet remain inside a centered axis-aligned room.
 *
 * @param feet Feet position.
 * @param floorY Room floor Y.
 * @param ceilingY Room ceiling Y.
 * @param roomWidth Room size along X.
 * @param roomDepth Room size along Z.
 */
function expectFeetInsideRoom(
  feet: THREE.Vector3,
  floorY: number,
  ceilingY: number,
  roomWidth: number,
  roomDepth: number,
): void {
  expect(feet.y).toBeLessThan(ceilingY - PLAYER_COLLIDER_HEIGHT_METERS);
  expect(feet.y).toBeGreaterThanOrEqual(floorY - 0.05);
  expect(Math.abs(feet.x)).toBeLessThan(roomWidth * 0.5);
  expect(Math.abs(feet.z)).toBeLessThan(roomDepth * 0.5);
}

describe('player collision in an inverted-world room', () => {
  const roomWidth = 6;
  const roomHeight = 3;
  const roomDepth = 5;
  const floorY = -roomHeight * 0.5;
  const ceilingY = roomHeight * 0.5;

  beforeAll(async () => {
    await PhysicsRapierRuntime.ensureLoaded();
  });

  it('treats the carved room interior as air and the universe outside as solid', () => {
    const { world } = createWorldForModel(createInvertedRoom(roomWidth, roomHeight, roomDepth));
    const levelWorld = world.syncLevelWorld();
    expect(levelWorld).toBeTruthy();
    if (!levelWorld) {
      return;
    }
    expect(levelWorld.isPointEnclosed(new THREE.Vector3(0, 0, 0))).toBe(false);
    expect(levelWorld.isPointEnclosed(new THREE.Vector3(0, floorY + 0.25, 0))).toBe(false);
    expect(levelWorld.isPointEnclosed(new THREE.Vector3(0, ceilingY + 1, 0))).toBe(true);
    expect(levelWorld.isPointEnclosed(new THREE.Vector3(roomWidth, 0, 0))).toBe(true);
    expect(playerCollisionCapsuleCenterBuried(levelWorld, new THREE.Vector3(0, floorY + 0.05, 0))).toBe(false);
  });

  it('keeps a standing pose inside the room when edit recovery searches for a free pose', () => {
    const { world } = createWorldForModel(createInvertedRoom(roomWidth, roomHeight, roomDepth));
    const levelWorld = world.syncLevelWorld();
    const rig = world.getCharacterRig();
    expect(levelWorld && rig).toBeTruthy();
    if (!levelWorld || !rig) {
      return;
    }
    const feet = new THREE.Vector3(0, floorY + 0.05, 0);
    const outcome = playerCollisionDepenetrate(levelWorld, rig, feet, true);
    expect(outcome).toBe('free');
    expect(feet.y).toBeLessThan(ceilingY - PLAYER_COLLIDER_HEIGHT_METERS);
    expect(feet.y).toBeGreaterThanOrEqual(floorY);
    expect(Math.abs(feet.x)).toBeLessThan(roomWidth * 0.5);
    expect(Math.abs(feet.z)).toBeLessThan(roomDepth * 0.5);
  });

  it('does not lift the player onto the roof when play collision starts inside the room', () => {
    const { world } = createWorldForModel(createInvertedRoom(roomWidth, roomHeight, roomDepth));
    const feet = new THREE.Vector3(0, floorY + 0.05, 0);
    const scratch = createPlayerCollisionScratch();
    playerCollisionIntegrateStep(world, feet, new THREE.Vector3(), 0, 1 / 60, scratch, null, false);
    expectFeetInsideRoom(feet, floorY, ceilingY, roomWidth, roomDepth);
  });

  it('keeps the player inside the room when play starts from a camera at the room centre', () => {
    const { world } = createWorldForModel(createInvertedRoom(roomWidth, roomHeight, roomDepth));
    const camera = createLookAtCamera(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1));
    const spawned = new THREE.Vector3();
    playerSpawnResolveFeetUnderCamera(camera, world, spawned);
    expectFeetInsideRoom(spawned, floorY, ceilingY, roomWidth, roomDepth);
    const feet = spawnAndStepPlayCollision(world, camera, 30);
    expectFeetInsideRoom(feet, floorY, ceilingY, roomWidth, roomDepth);
  });

  it('keeps the player inside the room when play starts from the default editor camera', () => {
    const { world } = createWorldForModel(createInvertedRoom(roomWidth, roomHeight, roomDepth));
    const camera = createLookAtCamera(getDefaultPerspectiveCameraPosition(), new THREE.Vector3(0, 0, 0));
    const spawned = new THREE.Vector3();
    playerSpawnResolveFeetUnderCamera(camera, world, spawned);
    expectFeetInsideRoom(spawned, floorY, ceilingY, roomWidth, roomDepth);
    const feet = spawnAndStepPlayCollision(world, camera, 30);
    expectFeetInsideRoom(feet, floorY, ceilingY, roomWidth, roomDepth);
  });

  it('still treats the interior of an additive solid as enclosed', () => {
    const model = new SolidModel('AdditiveBlock');
    model.addBoxBrush(2, SolidOperation.Additive);
    const { world } = createWorldForModel(model);
    const levelWorld = world.syncLevelWorld();
    expect(levelWorld).toBeTruthy();
    if (!levelWorld) {
      return;
    }
    expect(levelWorld.isPointEnclosed(new THREE.Vector3(0, 0, 0))).toBe(true);
    expect(levelWorld.isPointEnclosed(new THREE.Vector3(0, 3, 0))).toBe(false);
  });

  it('keeps an additive pillar solid when it sits inside an inverted room', () => {
    const room = createInvertedRoom(roomWidth, roomHeight, roomDepth);
    const pillar = new SolidModel('Pillar');
    pillar.addBoxBrush(1, SolidOperation.Additive);
    const root = new THREE.Group();
    root.add(room.root);
    root.add(pillar.root);
    root.updateMatrixWorld(true);
    const world = new PlayerCollisionWorld();
    world.activate();
    world.setWorldRoot(root);
    const levelWorld = world.syncLevelWorld();
    expect(levelWorld).toBeTruthy();
    if (!levelWorld) {
      return;
    }
    expect(levelWorld.isPointEnclosed(new THREE.Vector3(0, 0, 0))).toBe(true);
    expect(levelWorld.isPointEnclosed(new THREE.Vector3(2, 0, 0))).toBe(false);
    expect(levelWorld.isPointEnclosed(new THREE.Vector3(0, ceilingY + 1, 0))).toBe(true);
  });
});
