import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import { PlayerCollisionWorld } from '@/player/collision/player_collision_world.js';
import {
  createPlayerCollisionSolverScratch,
  playerCollisionSolvePose,
} from '@/player/collision/player_collision_solver.js';
import { SOLID_BRUSH_USERDATA_KEY } from '@/solid/model/solid_brush_visual.js';
import { SOLID_MODEL_RESULT_USERDATA_KEY } from '@/solid/model/solid_model_keys.js';

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
 * Builds a bevel volume at the given world center with the given world size.
 *
 * @param center World center.
 * @param size World size applied as scale on the unit volume.
 * @returns Volume mesh stamped as a modifier volume.
 */
function createBevelVolume(center: THREE.Vector3, size: THREE.Vector3): THREE.Mesh {
  const volume = ModifierVolumeBevel.create();
  volume.position.copy(center);
  volume.scale.copy(size);
  volume.updateMatrixWorld(true);
  return volume;
}

/**
 * Bakes one root and returns how many triangles entered the capsule soup.
 *
 * @param root Scene root.
 * @returns Baked triangle count.
 */
function bakedTriangleCount(root: THREE.Object3D): number {
  const world = new PlayerCollisionWorld();
  world.setWorldRoot(root);
  return world.getTriangleSoup().getTriangleCount();
}

describe('PlayerCollisionWorld', () => {
  it('hits a nearby wall and ignores far geometry through broadphase', () => {
    const root = new THREE.Group();
    root.add(createBoxMesh(new THREE.Vector3(2, 1, 0), new THREE.Vector3(1, 2, 4)));
    for (let index = 0; index < 40; index++) {
      root.add(createBoxMesh(new THREE.Vector3(50 + index * 3, 1, 50), new THREE.Vector3(1, 2, 1)));
    }
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const origin = new THREE.Vector3(0.5, 1, 0);
    const direction = new THREE.Vector3(1, 0, 0);
    const hit = world.raycastNearest(origin, direction, 5);
    expect(hit).toBeTruthy();
    expect(hit?.distance).toBeLessThan(1.5);
  });

  it('returns null when the ray misses all nearby solids', () => {
    const root = new THREE.Group();
    root.add(createBoxMesh(new THREE.Vector3(10, 1, 0), new THREE.Vector3(1, 2, 1)));
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const hit = world.raycastNearest(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), 2);
    expect(hit).toBeNull();
  });

  it('collides with solid CSG result meshes and ignores brush volume helpers', () => {
    const root = new THREE.Group();
    const result = createBoxMesh(new THREE.Vector3(2, 1, 0), new THREE.Vector3(1, 2, 4));
    result.userData[SOLID_MODEL_RESULT_USERDATA_KEY] = true;
    const brushHelper = createBoxMesh(new THREE.Vector3(0.5, 1, 0), new THREE.Vector3(2, 2, 2));
    brushHelper.userData[SOLID_BRUSH_USERDATA_KEY] = true;
    root.add(result);
    root.add(brushHelper);
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const hitThroughBrush = world.raycastNearest(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), 1.2);
    expect(hitThroughBrush).toBeNull();
    const hitResult = world.raycastNearest(new THREE.Vector3(0.5, 1, 0), new THREE.Vector3(1, 0, 0), 5);
    expect(hitResult).toBeTruthy();
    expect(hitResult?.distance).toBeGreaterThan(0.5);
    expect(hitResult?.object).toBe(result);
    expect(world.getTriangleSoup().getTriangleCount()).toBeGreaterThan(0);
  });

  it('does not bake brush helpers into the capsule triangle soup', () => {
    const root = new THREE.Group();
    const brushHelper = createBoxMesh(new THREE.Vector3(0, 1, 0), new THREE.Vector3(4, 2, 4));
    brushHelper.userData[SOLID_BRUSH_USERDATA_KEY] = true;
    root.add(brushHelper);
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    expect(world.getTriangleSoup().getTriangleCount()).toBe(0);
  });

  it('lets rays pass through a bevel volume and hit the content behind it', () => {
    const volumeSize = new THREE.Vector3(2, 2, 2);
    const wallSize = new THREE.Vector3(1, 2, 4);
    const gap = volumeSize.x;
    const volumeCenter = new THREE.Vector3(volumeSize.x * 0.5, volumeSize.y * 0.5, 0);
    const wallCenter = new THREE.Vector3(volumeSize.x + gap + wallSize.x * 0.5, wallSize.y * 0.5, 0);
    const wall = createBoxMesh(wallCenter, wallSize);
    const root = new THREE.Group();
    root.add(createBevelVolume(volumeCenter, volumeSize));
    root.add(wall);
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const origin = new THREE.Vector3(-volumeSize.x * 0.25, volumeCenter.y, 0);
    const reach = wallCenter.x + wallSize.x;
    const hit = world.raycastNearest(origin, new THREE.Vector3(1, 0, 0), reach);
    expect(hit?.object).toBe(wall);
  });

  it('does not treat a bevel volume as walkable ground', () => {
    const floorSize = new THREE.Vector3(4, 0.2, 4);
    const volumeSize = new THREE.Vector3(2, 2, 2);
    const floorCenter = new THREE.Vector3(0, floorSize.y * 0.5, 0);
    const volumeCenter = new THREE.Vector3(0, floorSize.y + volumeSize.y * 0.5, 0);
    const floor = createBoxMesh(floorCenter, floorSize);
    const root = new THREE.Group();
    root.add(floor);
    root.add(createBevelVolume(volumeCenter, volumeSize));
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const origin = new THREE.Vector3(0, floorSize.y + volumeSize.y + floorSize.y, 0);
    const hit = world.raycastNearest(origin, new THREE.Vector3(0, -1, 0), origin.y + floorSize.y);
    expect(hit?.object).toBe(floor);
    expect(hit?.point.y).toBeCloseTo(floorSize.y);
  });

  it('omits bevel volumes from the capsule triangle soup', () => {
    const floorSize = new THREE.Vector3(4, 0.2, 4);
    const floorCenter = new THREE.Vector3(0, floorSize.y * 0.5, 0);
    const floorRoot = new THREE.Group();
    floorRoot.add(createBoxMesh(floorCenter, floorSize));
    const floorTriangles = bakedTriangleCount(floorRoot);
    const combined = new THREE.Group();
    combined.add(createBoxMesh(floorCenter.clone(), floorSize.clone()));
    combined.add(createBevelVolume(new THREE.Vector3(0, floorSize.y + 1.5, 0), new THREE.Vector3(3, 3, 3)));
    expect(bakedTriangleCount(combined)).toBe(floorTriangles);
    expect(floorTriangles).toBeGreaterThan(0);
  });

  it('does not push the capsule out of a bevel volume', () => {
    const volumeSize = new THREE.Vector3(6, 6, 6);
    const root = new THREE.Group();
    root.add(createBevelVolume(new THREE.Vector3(0, volumeSize.y * 0.5, 0), volumeSize));
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const feet = new THREE.Vector3(0, volumeSize.y * 0.25, 0);
    const before = feet.clone();
    playerCollisionSolvePose(world.getTriangleSoup(), feet, createPlayerCollisionSolverScratch());
    expect(feet.distanceTo(before)).toBe(0);
    expect(world.getTriangleSoup().getTriangleCount()).toBe(0);
  });
});
