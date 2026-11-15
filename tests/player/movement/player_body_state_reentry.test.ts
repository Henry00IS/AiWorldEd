import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PlayerBodyState } from '@/player/movement/player_body_state.js';
import { PlayerLookState } from '@/player/look/player_look_state.js';
import { PlayerCollisionWorld } from '@/player/collision/player_collision_world.js';
import type { ManagerInput } from '@/input/manager_input.js';
import { PhysicsRapierRuntime } from '@/physics/rapier/physics_rapier_runtime.js';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';

/** Input stub with no keys held. */
const idleInput = {
  isKeyDown: () => false,
  isPhysicalKeyDown: () => false,
  isShiftDown: () => false,
} as unknown as ManagerInput;

/**
 * Builds an inverted-world model with one subtractive room centered on the
 * origin.
 *
 * @returns Room model.
 */
function createInvertedRoom(): SolidModel {
  const model = new SolidModel('InvertedRoom');
  const room = new SolidBrushInstance(
    'room',
    'Room',
    SolidBrushFactory.createCenteredBox(6, 3, 5),
    SolidOperation.Subtractive,
  );
  model.addBrushInstance(room);
  model.setInvertedWorld(true);
  return model;
}

/**
 * Builds a normal model whose additive slab top sits at Y 0, far from the room.
 *
 * @param centerX Slab center along X.
 * @returns Slab model.
 */
function createDistantSlab(centerX: number): SolidModel {
  const model = new SolidModel('Slab');
  const slab = new SolidBrushInstance(
    'slab',
    'Slab',
    SolidBrushFactory.createCenteredBox(10, 1, 10),
    SolidOperation.Additive,
  );
  model.addBrushInstance(slab);
  model.root.position.set(centerX, -0.5, 0);
  return model;
}

/**
 * Runs one play session: spawns the body and steps it while idle.
 *
 * @param body Body reused across sessions like the play session does.
 * @param world Collision world.
 * @param spawnFeet Spawn feet position.
 * @param frames Frames to simulate.
 */
function playSession(
  body: PlayerBodyState,
  world: PlayerCollisionWorld,
  spawnFeet: THREE.Vector3,
  frames: number,
): void {
  world.activate();
  body.resetAt(spawnFeet, world);
  const look = new PlayerLookState(0, 0);
  for (let frame = 0; frame < frames; frame++) {
    body.update(idleInput, look, world, 1 / 60);
  }
}

describe('PlayerBodyState play re-entry', () => {
  beforeAll(async () => {
    await PhysicsRapierRuntime.ensureLoaded();
  });

  it('starts a later session at its own spawn, not where an inverted-world session stood', () => {
    const slabX = 40;
    const root = new THREE.Group();
    root.add(createInvertedRoom().root);
    root.add(createDistantSlab(slabX).root);
    root.updateMatrixWorld(true);
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const body = new PlayerBodyState();

    playSession(body, world, new THREE.Vector3(0, -1.45, 0), 30);
    expect(Math.abs(body.getFeetPosition().x)).toBeLessThan(3);
    world.release();

    playSession(body, world, new THREE.Vector3(slabX, 0.05, 0), 30);
    expect(body.getFeetPosition().x).toBeCloseTo(slabX, 1);
    expect(body.getFeetPosition().y).toBeGreaterThan(-0.1);
  });
});
