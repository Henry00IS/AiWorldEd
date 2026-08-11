import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PlayerCollisionWorld } from '@/player/collision/player_collision_world.js';
import { PLAYER_EYE_HEIGHT_METERS } from '@/player/player_constants.js';
import { playerSpawnRaycastSupportY, playerSpawnResolveFeetUnderCamera } from '@/player/spawn/player_spawn_ground.js';

/**
 * Builds a thick floor box with its top surface at y = 0.
 *
 * @returns Floor mesh.
 */
function createFloorMesh(): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(40, 2, 40));
  mesh.position.set(0, -1, 0);
  mesh.updateMatrixWorld(true);
  return mesh;
}

/**
 * Builds a thick ceiling box with its bottom surface at the given Y.
 *
 * @param bottomY World Y of the ceiling underside.
 * @returns Ceiling mesh.
 */
function createCeilingMesh(bottomY: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(40, 2, 40));
  mesh.position.set(0, bottomY + 1, 0);
  mesh.updateMatrixWorld(true);
  return mesh;
}

/**
 * Builds a collision world with a floor under the origin.
 *
 * @returns Collision world.
 */
function createFloorWorld(): PlayerCollisionWorld {
  const root = new THREE.Group();
  root.add(createFloorMesh());
  const world = new PlayerCollisionWorld();
  world.setWorldRoot(root);
  return world;
}

/**
 * Builds a chamber with floor top at y = 0 and ceiling bottom at
 * ceilingBottomY.
 *
 * @param ceilingBottomY World Y of the ceiling underside.
 * @returns Collision world.
 */
function createChamberWorld(ceilingBottomY: number): PlayerCollisionWorld {
  const root = new THREE.Group();
  root.add(createFloorMesh());
  root.add(createCeilingMesh(ceilingBottomY));
  const world = new PlayerCollisionWorld();
  world.setWorldRoot(root);
  return world;
}

describe('playerSpawnResolveFeetUnderCamera', () => {
  it('places feet on the floor top when the camera is low above the ground', () => {
    const world = createFloorWorld();
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(2, 0.35, -3);
    camera.updateMatrixWorld(true);
    const feet = new THREE.Vector3();
    playerSpawnResolveFeetUnderCamera(camera, world, feet);
    expect(feet.x).toBeCloseTo(2, 3);
    expect(feet.z).toBeCloseTo(-3, 3);
    expect(feet.y).toBeGreaterThan(-0.05);
    expect(feet.y).toBeLessThan(0.15);
  });

  it('does not leave feet buried below the floor when camera is near ground height', () => {
    const world = createFloorWorld();
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0.2, 0);
    camera.updateMatrixWorld(true);
    const naiveFeetY = camera.position.y - PLAYER_EYE_HEIGHT_METERS;
    expect(naiveFeetY).toBeLessThan(-1);
    const feet = new THREE.Vector3();
    playerSpawnResolveFeetUnderCamera(camera, world, feet);
    expect(feet.y).toBeGreaterThan(naiveFeetY + 1);
    expect(feet.y).toBeGreaterThan(-0.05);
  });

  it('keeps mid-air spawn when the camera is high above the floor', () => {
    const world = createFloorWorld();
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(1, 12, 1);
    camera.updateMatrixWorld(true);
    const feet = new THREE.Vector3();
    playerSpawnResolveFeetUnderCamera(camera, world, feet);
    expect(feet.y).toBeCloseTo(12 - PLAYER_EYE_HEIGHT_METERS, 3);
  });

  it('lifts onto the floor not the ceiling when the camera is too low in a chamber', () => {
    const ceilingBottomY = 4;
    const world = createChamberWorld(ceilingBottomY);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1.2, 0);
    camera.updateMatrixWorld(true);
    const feet = new THREE.Vector3();
    playerSpawnResolveFeetUnderCamera(camera, world, feet);
    expect(feet.y).toBeGreaterThan(-0.05);
    expect(feet.y).toBeLessThan(0.15);
    expect(feet.y).toBeLessThan(ceilingBottomY - 1);
  });

  it('keeps mid-air spawn inside a chamber when camera is above eye height', () => {
    const world = createChamberWorld(6);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 3.5, 0);
    camera.updateMatrixWorld(true);
    const feet = new THREE.Vector3();
    playerSpawnResolveFeetUnderCamera(camera, world, feet);
    expect(feet.y).toBeCloseTo(3.5 - PLAYER_EYE_HEIGHT_METERS, 3);
  });
});

describe('playerSpawnRaycastSupportY', () => {
  it('returns null when no geometry exists under the sample', () => {
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(new THREE.Group());
    expect(playerSpawnRaycastSupportY(new THREE.Vector3(0, 2, 0), world)).toBeNull();
  });

  it('finds floor support under a low sample position', () => {
    const world = createFloorWorld();
    const y = playerSpawnRaycastSupportY(new THREE.Vector3(0, 0.25, 0), world);
    expect(y).not.toBeNull();
    expect(y as number).toBeGreaterThan(-0.05);
    expect(y as number).toBeLessThan(0.15);
  });

  it('hits the floor not the ceiling when probing from inside a chamber', () => {
    const ceilingBottomY = 4;
    const world = createChamberWorld(ceilingBottomY);
    const y = playerSpawnRaycastSupportY(new THREE.Vector3(0, 1.5, 0), world);
    expect(y).not.toBeNull();
    expect(y as number).toBeGreaterThan(-0.05);
    expect(y as number).toBeLessThan(0.15);
  });
});
