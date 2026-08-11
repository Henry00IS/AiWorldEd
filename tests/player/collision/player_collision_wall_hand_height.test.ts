import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PlayerCollisionWorld } from '@/player/collision/player_collision_world.js';
import {
  createPlayerCollisionScratch,
  playerCollisionIntegrateStep,
} from '@/player/collision/player_collision_resolve.js';
import { playerCollisionWallSupportsHandPush } from '@/player/collision/player_collision_wall_hand_height.js';
import { PLAYER_COLLIDER_RADIUS_METERS, PLAYER_WALL_HAND_MIN_HEIGHT_METERS } from '@/player/player_constants.js';

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
 * Builds a world with floor plus one vertical barrier.
 *
 * @param wallCenter Wall box center.
 * @param wallSize Wall box size.
 * @returns Collision world.
 */
function createWorldWithWall(wallCenter: THREE.Vector3, wallSize: THREE.Vector3): PlayerCollisionWorld {
  const root = new THREE.Group();
  root.add(createBoxMesh(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(20, 1, 20)));
  root.add(createBoxMesh(wallCenter, wallSize));
  const world = new PlayerCollisionWorld();
  world.setWorldRoot(root);
  return world;
}

/**
 * Drives the capsule into a +X wall until blocked and returns feet X.
 *
 * @param world Collision world.
 * @returns Final feet position after impact.
 */
function driveIntoWall(world: PlayerCollisionWorld): THREE.Vector3 {
  const scratch = createPlayerCollisionScratch();
  const feet = new THREE.Vector3(0.8, 0, 0);
  for (let step = 0; step < 40; step++) {
    playerCollisionIntegrateStep(
      world,
      feet,
      new THREE.Vector3(0.25, 0, 0),
      0,
      1 / 60,
      scratch,
      new THREE.Vector3(1, 0, 0),
    );
  }
  return feet;
}

describe('playerCollisionWallSupportsHandPush', () => {
  it('accepts a tall wall while jammed against it', () => {
    const world = createWorldWithWall(new THREE.Vector3(2, 1.5, 0), new THREE.Vector3(1, 3, 4));
    const feet = driveIntoWall(world);
    expect(feet.x).toBeLessThan(1.5 - PLAYER_COLLIDER_RADIUS_METERS + 0.05);
    expect(playerCollisionWallSupportsHandPush(world.getTriangleSoup(), feet)).toBe(true);
  });

  it('rejects a short curb while jammed against it', () => {
    const world = createWorldWithWall(new THREE.Vector3(2, 0.5, 0), new THREE.Vector3(1, 1, 4));
    const feet = driveIntoWall(world);
    expect(playerCollisionWallSupportsHandPush(world.getTriangleSoup(), feet)).toBe(false);
    expect(PLAYER_WALL_HAND_MIN_HEIGHT_METERS).toBeCloseTo(1.4);
  });

  it('marks wall push on tall walls and not on short curbs', () => {
    const tall = createWorldWithWall(new THREE.Vector3(2, 1.5, 0), new THREE.Vector3(1, 3, 4));
    const short = createWorldWithWall(new THREE.Vector3(2, 0.5, 0), new THREE.Vector3(1, 1, 4));
    const tallScratch = createPlayerCollisionScratch();
    const shortScratch = createPlayerCollisionScratch();
    const tallFeet = new THREE.Vector3(0.8, 0, 0);
    const shortFeet = new THREE.Vector3(0.8, 0, 0);
    let tallPush = false;
    let shortPush = false;
    for (let step = 0; step < 40; step++) {
      const tallResult = playerCollisionIntegrateStep(
        tall,
        tallFeet,
        new THREE.Vector3(0.25, 0, 0),
        0,
        1 / 60,
        tallScratch,
        new THREE.Vector3(1, 0, 0),
      );
      const shortResult = playerCollisionIntegrateStep(
        short,
        shortFeet,
        new THREE.Vector3(0.25, 0, 0),
        0,
        1 / 60,
        shortScratch,
        new THREE.Vector3(1, 0, 0),
      );
      tallPush = tallPush || tallResult.isWallPushing;
      shortPush = shortPush || shortResult.isWallPushing;
    }
    expect(tallPush).toBe(true);
    expect(shortPush).toBe(false);
  });
});
