import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PhysicsLevelWorld } from '@/physics/level/physics_level_world.js';
import { physicsLevelTrimeshBuild, physicsLevelTrimeshExpandGeometry } from '@/physics/level/physics_level_trimesh.js';
import { PhysicsRapierRuntime, type PhysicsRapierModule } from '@/physics/rapier/physics_rapier_runtime.js';

/**
 * Builds trimesh buffers for an axis-aligned box centered on the origin.
 *
 * @param size Box size.
 * @returns Trimesh buffers.
 */
function createBoxBuffers(size: THREE.Vector3): NonNullable<ReturnType<typeof physicsLevelTrimeshBuild>> {
  const positions = physicsLevelTrimeshExpandGeometry(new THREE.BoxGeometry(size.x, size.y, size.z));
  const buffers = physicsLevelTrimeshBuild(positions);
  if (!buffers) {
    throw new Error('box produced no triangles');
  }
  return buffers;
}

/**
 * Creates a level world with one box collider stored under a key.
 *
 * @param rapier Loaded Rapier module.
 * @param key Collider key.
 * @param center Box world center.
 * @returns Level world.
 */
function createWorldWithBox(rapier: PhysicsRapierModule, key: string, center: THREE.Vector3): PhysicsLevelWorld {
  const world = new PhysicsLevelWorld(rapier);
  world.setTrimesh(key, createBoxBuffers(new THREE.Vector3(1, 1, 1)), center, new THREE.Quaternion());
  world.commit();
  return world;
}

const rayOrigin = new THREE.Vector3(0, 0, 0);
const rayDirection = new THREE.Vector3(1, 0, 0);

describe('PhysicsLevelWorld', () => {
  let rapier: PhysicsRapierModule;

  beforeAll(async () => {
    rapier = await PhysicsRapierRuntime.ensureLoaded();
  });

  it('makes a collider inserted right before a query visible after commit', () => {
    const world = new PhysicsLevelWorld(rapier);
    world.setTrimesh(
      'wall',
      createBoxBuffers(new THREE.Vector3(1, 1, 1)),
      new THREE.Vector3(3, 0, 0),
      new THREE.Quaternion(),
    );
    expect(world.hasPendingChanges()).toBe(true);
    expect(world.commit()).toBe(true);
    const hit = world.castRay(rayOrigin, rayDirection, 10);
    expect(hit?.distance).toBeCloseTo(2.5, 3);
    expect(hit?.colliderKey).toBe('wall');
    expect(hit?.normal.x).toBeCloseTo(-1, 3);
    world.dispose();
  });

  it('stops hitting a collider once it is removed and committed', () => {
    const world = createWorldWithBox(rapier, 'wall', new THREE.Vector3(3, 0, 0));
    world.removeCollider('wall');
    world.commit();
    expect(world.castRay(rayOrigin, rayDirection, 10)).toBeNull();
    expect(world.getStats().colliderCount).toBe(0);
    expect(world.getStats().triangleCount).toBe(0);
    world.dispose();
  });

  it('moves a collider without rebuilding its triangles', () => {
    const world = createWorldWithBox(rapier, 'wall', new THREE.Vector3(3, 0, 0));
    const builtBefore = world.getStats().collidersBuilt;
    world.setColliderPose('wall', new THREE.Vector3(6, 0, 0), new THREE.Quaternion());
    world.commit();
    expect(world.castRay(rayOrigin, rayDirection, 10)?.distance).toBeCloseTo(5.5, 3);
    expect(world.getStats().collidersBuilt).toBe(builtBefore);
    world.dispose();
  });

  it('reports a sphere sweep normal that faces back toward the sphere', () => {
    const world = createWorldWithBox(rapier, 'floor', new THREE.Vector3(0, -0.5, 0));
    const hit = world.castSphere(new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, -1, 0), 0.25, 5);
    expect(hit?.distance).toBeCloseTo(1.75, 2);
    expect(hit?.normal.y).toBeCloseTo(1, 3);
    world.dispose();
  });

  it('drops degenerate and non-finite triangles before building a collider', () => {
    const positions = new Float32Array([
      0,
      0,
      0,
      1,
      0,
      0,
      2,
      0,
      0,
      0,
      0,
      0,
      Number.NaN,
      0,
      0,
      1,
      1,
      1,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1,
    ]);
    const buffers = physicsLevelTrimeshBuild(positions);
    expect(buffers?.triangleCount).toBe(1);
    expect(physicsLevelTrimeshBuild(new Float32Array([0, 0, 0, 1, 0, 0, 2, 0, 0]))).toBeNull();
  });

  it('applies a bake matrix to the collider vertices', () => {
    const world = new PhysicsLevelWorld(rapier);
    const positions = physicsLevelTrimeshExpandGeometry(new THREE.BoxGeometry(1, 1, 1));
    const bake = new THREE.Matrix4().makeScale(4, 1, 1);
    const buffers = physicsLevelTrimeshBuild(positions, bake);
    if (!buffers) {
      throw new Error('scaled box produced no triangles');
    }
    world.setTrimesh('scaled', buffers, new THREE.Vector3(5, 0, 0), new THREE.Quaternion());
    world.commit();
    expect(world.castRay(rayOrigin, rayDirection, 10)?.distance).toBeCloseTo(3, 3);
    world.dispose();
  });

  it('tells enclosed points from points in an open pit or above a floor', () => {
    const world = createWorldWithBox(rapier, 'block', new THREE.Vector3(0, 0.5, 0));
    world.setTrimesh(
      'floor',
      createBoxBuffers(new THREE.Vector3(1, 1, 1)),
      new THREE.Vector3(0, -0.5, 0),
      new THREE.Quaternion(),
    );
    world.commit();
    expect(world.isPointEnclosed(new THREE.Vector3(0, 0.5, 0))).toBe(true);
    expect(world.isPointEnclosed(new THREE.Vector3(0, -0.5, 0))).toBe(true);
    expect(world.isPointEnclosed(new THREE.Vector3(0, 2, 0))).toBe(false);
    expect(world.isPointEnclosed(new THREE.Vector3(3, 0.5, 0))).toBe(false);
    world.dispose();
  });
});
