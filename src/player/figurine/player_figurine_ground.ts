import type * as THREE from 'three';
import { playerCollisionIsCollidableMesh } from '@/player/collision/player_collision_world.js';
import type { SceneRaycaster } from '@/selection/object/scene_raycaster.js';

/**
 * Finds where a ray first meets the level, for dropping the spawn figurine in
 * the editor. It casts against the visible meshes play mode would collide with,
 * through the selection BVH, so placing the figurine never builds a physics
 * world.
 *
 * @param raycaster Shared BVH raycaster.
 * @param root World root.
 * @param ray World-space ray.
 * @param target Receives the hit point.
 * @returns True when the ray hit level geometry.
 */
export function playerFigurineGroundHit(
  raycaster: SceneRaycaster,
  root: THREE.Object3D,
  ray: THREE.Ray,
  target: THREE.Vector3,
): boolean {
  const meshes: THREE.Mesh[] = [];
  root.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh === true && playerCollisionIsCollidableMesh(mesh)) meshes.push(mesh);
  });
  const hit = raycaster.castRay(ray, meshes)[0];
  if (hit === undefined) return false;
  target.copy(hit.point);
  return true;
}
