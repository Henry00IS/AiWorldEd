import * as THREE from 'three';
import { PhysicsLevelWorld } from '@/physics/level/physics_level_world.js';
import { physicsLevelTrimeshBuild, physicsLevelTrimeshExpandGeometry } from '@/physics/level/physics_level_trimesh.js';
import type { PhysicsRapierModule } from '@/physics/rapier/physics_rapier_runtime.js';

/** One box collider: key, center, size and optional Y rotation. */
export interface BoxSpec {
  key: string;
  center: THREE.Vector3;
  size: THREE.Vector3;
  yaw: number;
}

export const PHYSICS_BALL_TEST_ROOM: readonly BoxSpec[] = [
  { key: 'floor', center: new THREE.Vector3(0, -0.5, 0), size: new THREE.Vector3(20, 1, 20), yaw: 0 },
  { key: 'wall', center: new THREE.Vector3(6, 2, 0), size: new THREE.Vector3(0.5, 4, 20), yaw: 0 },
  { key: 'ramp', center: new THREE.Vector3(-3, 0.3, 2), size: new THREE.Vector3(3, 0.2, 3), yaw: 0.6 },
  { key: 'pillar', center: new THREE.Vector3(2, 1, -1.5), size: new THREE.Vector3(0.7, 2, 0.7), yaw: 0.35 },
  { key: 'step', center: new THREE.Vector3(3.5, 0.15, 1.2), size: new THREE.Vector3(2, 0.3, 1), yaw: -0.2 },
];

/**
 * Builds a level world from box specs in the given order.
 *
 * @param rapier Loaded Rapier module.
 * @param boxes Boxes to insert, in insertion order.
 * @returns Committed level world.
 */
export function physicsBallTestWorld(rapier: PhysicsRapierModule, boxes: readonly BoxSpec[]): PhysicsLevelWorld {
  const world = new PhysicsLevelWorld(rapier);
  for (const box of boxes) {
    const positions = physicsLevelTrimeshExpandGeometry(new THREE.BoxGeometry(box.size.x, box.size.y, box.size.z));
    const buffers = physicsLevelTrimeshBuild(positions);
    if (buffers) {
      const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), box.yaw);
      world.setTrimesh(box.key, buffers, box.center, rotation);
    }
  }
  world.commit();
  return world;
}
