import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PlayerCameraPoseApplier } from '@/player/camera/player_camera_pose.js';
import { PlayerLookState } from '@/player/look/player_look_state.js';
import { PlayerCollisionWorld } from '@/player/collision/player_collision_world.js';
import {
  PLAYER_CAMERA_FLOOR_SKIN_METERS,
  PLAYER_EYE_HEIGHT_METERS,
  PLAYER_PITCH_LIMIT_RADIANS,
  PLAYER_THIRD_PERSON_DISTANCE_MIN,
} from '@/player/player_constants.js';

/**
 * Builds a large floor box whose top surface sits at y = 0.
 *
 * @returns Floor mesh ready for collision.
 */
function createFloorMesh(): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(40, 1, 40));
  mesh.position.set(0, -0.5, 0);
  mesh.updateMatrixWorld(true);
  return mesh;
}

/**
 * Builds a collision world containing only the given root group.
 *
 * @param root Scene root for collision candidates.
 * @returns Configured collision world.
 */
function createWorldWithRoot(root: THREE.Object3D): PlayerCollisionWorld {
  const world = new PlayerCollisionWorld();
  world.setWorldRoot(root);
  return world;
}

describe('PlayerCameraPoseApplier', () => {
  it('places the camera at eye height in first-person mode', () => {
    const applier = new PlayerCameraPoseApplier();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    const look = new PlayerLookState(0, 0);
    const world = new PlayerCollisionWorld();
    const feet = new THREE.Vector3(1, 0, 2);
    applier.apply(camera, feet, look, 'first_person', world);
    expect(camera.position.x).toBeCloseTo(1);
    expect(camera.position.y).toBeCloseTo(PLAYER_EYE_HEIGHT_METERS);
    expect(camera.position.z).toBeCloseTo(2);
  });

  it('places the camera behind the player in third-person mode', () => {
    const applier = new PlayerCameraPoseApplier();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    const look = new PlayerLookState(0, 0);
    const world = new PlayerCollisionWorld();
    const feet = new THREE.Vector3(0, 0, 0);
    applier.apply(camera, feet, look, 'third_person', world);
    expect(camera.position.z).toBeLessThan(0);
    expect(camera.position.distanceTo(new THREE.Vector3(0, PLAYER_EYE_HEIGHT_METERS, 0))).toBeGreaterThan(
      PLAYER_THIRD_PERSON_DISTANCE_MIN * 0.5,
    );
  });

  it('zooms third-person distance with the mouse wheel', () => {
    const applier = new PlayerCameraPoseApplier();
    const before = applier.getThirdPersonDistance();
    applier.applyWheelZoom(100);
    expect(applier.getThirdPersonDistance()).toBeGreaterThan(before);
    applier.applyWheelZoom(-100);
    expect(applier.getThirdPersonDistance()).toBeLessThan(applier.getThirdPersonDistance() + 1);
  });

  it('snaps the third-person camera onto nearby floor when the orbit dips through it', () => {
    const root = new THREE.Group();
    const platform = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 2));
    platform.position.set(0, -0.5, 0);
    platform.updateMatrixWorld(true);
    root.add(platform);
    const world = createWorldWithRoot(root);
    const applier = new PlayerCameraPoseApplier();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    const look = new PlayerLookState(0, PLAYER_PITCH_LIMIT_RADIANS * 0.85);
    const feet = new THREE.Vector3(0, 0, 0);
    applier.apply(camera, feet, look, 'third_person', world);
    expect(camera.position.y).toBeGreaterThanOrEqual(PLAYER_CAMERA_FLOOR_SKIN_METERS - 1e-4);
  });

  it('does not pull a high third-person camera down to a distant floor', () => {
    const root = new THREE.Group();
    root.add(createFloorMesh());
    const world = createWorldWithRoot(root);
    const applier = new PlayerCameraPoseApplier();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    const look = new PlayerLookState(0, PLAYER_PITCH_LIMIT_RADIANS * 0.7);
    const feet = new THREE.Vector3(0, 12, 0);
    applier.apply(camera, feet, look, 'third_person', world);
    expect(camera.position.y).toBeGreaterThan(8);
  });
});
