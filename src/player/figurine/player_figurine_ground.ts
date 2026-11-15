import * as THREE from 'three';
import { raycastMeshBvhFrontFacing, type MeshBvhWorldHit } from '@/edit/pick/edit_component_bvh_ray.js';
import { playerCollisionIsCollidableMesh } from '@/player/collision/player_collision_world.js';

const scratchDirection = new THREE.Vector3();

/**
 * Finds where a ray first meets the air-facing side of the level, for dropping
 * the spawn figurine in the editor. Back faces are ignored so a ray from
 * outside an inverted-world room reaches the interior floor instead of the
 * roof. Placement never builds a physics world.
 *
 * @param root World root.
 * @param ray World-space ray.
 * @param target Receives the hit point.
 * @returns True when the ray hit front-facing level geometry.
 */
export function playerFigurineGroundHit(root: THREE.Object3D, ray: THREE.Ray, target: THREE.Vector3): boolean {
  const meshes = playerFigurineCollectCollidableMeshes(root);
  scratchDirection.copy(ray.direction);
  if (scratchDirection.lengthSq() < 1e-12) {
    return false;
  }
  scratchDirection.normalize();
  const hit = playerFigurineClosestFrontFaceHit(meshes, ray.origin, scratchDirection);
  if (!hit) {
    return false;
  }
  target.copy(hit.point);
  return true;
}

/**
 * Collects visible collidable meshes under a root.
 *
 * @param root World root.
 * @returns Meshes that can receive the figurine.
 */
function playerFigurineCollectCollidableMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh === true && playerCollisionIsCollidableMesh(mesh)) {
      meshes.push(mesh);
    }
  });
  return meshes;
}

/**
 * Returns the closest front-facing hit among meshes.
 *
 * @param meshes Candidate meshes.
 * @param origin World ray origin.
 * @param direction Unit world ray direction.
 * @returns Closest hit, or null when none.
 */
function playerFigurineClosestFrontFaceHit(
  meshes: THREE.Mesh[],
  origin: THREE.Vector3,
  direction: THREE.Vector3,
): MeshBvhWorldHit | null {
  let closest: MeshBvhWorldHit | null = null;
  for (const mesh of meshes) {
    const hit = raycastMeshBvhFrontFacing(mesh, origin, direction);
    if (hit && (!closest || hit.distance < closest.distance)) {
      closest = hit;
    }
  }
  return closest;
}
