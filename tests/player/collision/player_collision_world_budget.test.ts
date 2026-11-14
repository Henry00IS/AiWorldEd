import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  PLAYER_COLLISION_FLUSH_RADIUS_METERS,
  PlayerCollisionWorld,
  playerCollisionBudget,
} from '@/player/collision/player_collision_world.js';
import { PhysicsRapierRuntime } from '@/physics/rapier/physics_rapier_runtime.js';

const DOWN = new THREE.Vector3(0, -1, 0);
/** Tiles per side of the test floor (2 m tiles). */
const TILES = 20;

/**
 * Builds a floor of detailed 2 m tiles with their tops at y = 0, starting at
 * the origin.
 *
 * @returns Root and tiles.
 */
function tiledFloor(): { root: THREE.Group; tiles: THREE.Mesh[] } {
  const root = new THREE.Group();
  const tiles: THREE.Mesh[] = [];
  for (let x = 0; x < TILES; x++) {
    for (let z = 0; z < TILES; z++) {
      const tile = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 2, 16, 1, 16));
      tile.position.set(x * 2 + 1, -0.5, z * 2 + 1);
      tiles.push(tile);
      root.add(tile);
    }
  }
  root.updateMatrixWorld(true);
  return { root, tiles };
}

/**
 * Returns the height of the level under a point.
 *
 * @param world Collision world.
 * @param x World x.
 * @param z World z.
 * @returns Hit height, or null.
 */
function heightAt(world: PlayerCollisionWorld, x: number, z: number): number | null {
  const hit = world.raycastNearest(new THREE.Vector3(x, 5, z), DOWN, 20);
  return hit ? Math.round(hit.point.y * 1000) / 1000 : null;
}

describe('PlayerCollisionWorld demand and budget', () => {
  beforeAll(async () => {
    await PhysicsRapierRuntime.ensureLoaded();
  });

  it('costs nothing until play mode activates it and frees everything on release', () => {
    const { root } = tiledFloor();
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    expect(world.isReady()).toBe(false);
    expect(world.syncLevelWorld()).toBeNull();
    expect(heightAt(world, 1, 1)).toBeNull();
    expect(world.getSceneSync()).toBeNull();
    world.activate();
    expect(heightAt(world, 1, 1)).toBe(0);
    world.release();
    expect(world.isActive()).toBe(false);
    expect(world.getSceneSync()).toBeNull();
    expect(heightAt(world, 1, 1)).toBeNull();
  });

  it('applies edits near the focus at once, keeps old colliders far away, and catches up without focus', () => {
    const { root, tiles } = tiledFloor();
    const world = new PlayerCollisionWorld();
    world.activate();
    world.setWorldRoot(root);
    expect(heightAt(world, 39, 39)).toBe(0);
    tiles.forEach((tile) => (tile.geometry = new THREE.BoxGeometry(2, 1, 2, 16, 1, 16).translate(0, 0.5, 0)));
    world.setFocus('player', [new THREE.Vector3(1, 0, 1)]);
    expect(heightAt(world, 1, 1)).toBe(0.5);
    expect(heightAt(world, 7, 7)).toBe(0.5);
    expect(heightAt(world, 39, 39)).toBe(0);
    world.setFocus('player', []);
    expect(heightAt(world, 39, 39)).toBe(0.5);
  });

  it('budgets a region around every focus point plus the given time', () => {
    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(20, 1, 0)];
    const budget = playerCollisionBudget(points, 1);
    const reach = PLAYER_COLLISION_FLUSH_RADIUS_METERS;
    expect(budget.region.min.toArray()).toEqual([-reach, -reach, -reach]);
    expect(budget.region.max.toArray()).toEqual([20 + reach, 1 + reach, reach]);
    expect([budget.focus, budget.milliseconds]).toEqual([points, 1]);
  });
});
