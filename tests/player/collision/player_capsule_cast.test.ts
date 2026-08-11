import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  createPlayerCapsuleCastHit,
  createPlayerCapsuleCastScratch,
  playerCapsuleCast,
  playerCapsuleDepenetrate,
} from '@/player/collision/player_capsule_cast.js';
import { PlayerCollisionWorld } from '@/player/collision/player_collision_world.js';

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

describe('playerCapsuleCast', () => {
  it('detects a thin wall mid-path instead of tunneling to free space beyond it', () => {
    const root = new THREE.Group();
    root.add(createBoxMesh(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(20, 1, 20)));
    root.add(createBoxMesh(new THREE.Vector3(1.2, 1, 0), new THREE.Vector3(0.08, 2, 4)));
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const soup = world.getTriangleSoup();
    const feet = new THREE.Vector3(0, 0, 0);
    const scratch = createPlayerCapsuleCastScratch();
    const hit = createPlayerCapsuleCastHit();
    const found = playerCapsuleCast(soup, feet, new THREE.Vector3(1, 0, 0), 3, scratch, hit);
    expect(found).toBe(true);
    expect(hit.distance).toBeLessThan(1.2);
    expect(hit.distance).toBeGreaterThan(0.4);
  });

  it('depenetrates a capsule buried in the floor without large residual depth', () => {
    const root = new THREE.Group();
    root.add(createBoxMesh(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(20, 1, 20)));
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const soup = world.getTriangleSoup();
    const feet = new THREE.Vector3(0, -0.2, 0);
    const scratch = createPlayerCapsuleCastScratch();
    playerCapsuleDepenetrate(soup, feet, scratch, 6);
    expect(feet.y).toBeGreaterThan(-0.05);
  });
});
