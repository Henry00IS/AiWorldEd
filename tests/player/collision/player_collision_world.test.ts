import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PlayerCollisionWorld } from '@/player/collision/player_collision_world.js';
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
});
