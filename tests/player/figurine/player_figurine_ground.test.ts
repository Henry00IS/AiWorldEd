import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { playerFigurineGroundHit } from '@/player/figurine/player_figurine_ground.js';
import { PLAYER_FIGURINE_USERDATA_KEY } from '@/player/player_constants.js';
import { SceneRaycaster } from '@/selection/object/scene_raycaster.js';

/**
 * Builds a box mesh with its top at a height.
 *
 * @param top Top height.
 * @returns Mesh.
 */
function slab(top: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 4));
  mesh.position.set(0, top - 0.5, 0);
  return mesh;
}

describe('playerFigurineGroundHit', () => {
  it('hits the visible collidable level without any physics, skipping figurines and hidden meshes', () => {
    const root = new THREE.Group();
    const figurine = slab(3);
    figurine.userData[PLAYER_FIGURINE_USERDATA_KEY] = true;
    const hidden = slab(2);
    hidden.visible = false;
    root.add(slab(1), figurine, hidden);
    root.updateMatrixWorld(true);
    const target = new THREE.Vector3();
    const down = new THREE.Ray(new THREE.Vector3(0, 10, 0), new THREE.Vector3(0, -1, 0));
    expect(playerFigurineGroundHit(new SceneRaycaster(), root, down, target)).toBe(true);
    expect(target.y).toBeCloseTo(1, 6);
    const away = new THREE.Ray(new THREE.Vector3(50, 10, 0), new THREE.Vector3(0, -1, 0));
    expect(playerFigurineGroundHit(new SceneRaycaster(), root, away, target)).toBe(false);
  });
});
