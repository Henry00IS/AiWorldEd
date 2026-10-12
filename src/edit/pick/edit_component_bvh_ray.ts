import * as THREE from 'three';
import { getOrBuildFacePickBvh } from '@/selection/pick/mesh_pick_acceleration.js';
import type { TriangleBvhHit } from '@/selection/pick/triangle_bvh.js';

/** One world-space triangle hit from a mesh BVH. */
export interface MeshBvhWorldHit {
  /** Display triangle index. */
  triangleIndex: number;
  /** Distance from the world ray origin along the unit world direction. */
  distance: number;
  /** Hit point in world space. */
  point: THREE.Vector3;
}

const scratchInverse = new THREE.Matrix4();
const scratchLocalOrigin = new THREE.Vector3();
const scratchLocalEnd = new THREE.Vector3();
const scratchLocalDirection = new THREE.Vector3();
const scratchWorldPoint = new THREE.Vector3();

/**
 * Raycasts a mesh with its cached triangle BVH, accepting both triangle sides.
 *
 * @param mesh Occluder or pick mesh.
 * @param worldOrigin World ray origin.
 * @param worldDirection Unit world ray direction.
 * @param maxDistance Maximum world distance.
 * @returns Closest hit, or null.
 */
export function raycastMeshBvhDoubleSided(
  mesh: THREE.Mesh,
  worldOrigin: THREE.Vector3,
  worldDirection: THREE.Vector3,
  maxDistance: number = Infinity,
): MeshBvhWorldHit | null {
  return raycastMeshBvh(mesh, worldOrigin, worldDirection, maxDistance, false);
}

/**
 * Raycasts a mesh with its cached triangle BVH, accepting front faces only.
 *
 * @param mesh Pick mesh.
 * @param worldOrigin World ray origin.
 * @param worldDirection Unit world ray direction.
 * @param maxDistance Maximum world distance.
 * @returns Closest front hit, or null.
 */
export function raycastMeshBvhFrontFacing(
  mesh: THREE.Mesh,
  worldOrigin: THREE.Vector3,
  worldDirection: THREE.Vector3,
  maxDistance: number = Infinity,
): MeshBvhWorldHit | null {
  return raycastMeshBvh(mesh, worldOrigin, worldDirection, maxDistance, true);
}

/**
 * Raycasts one mesh BVH and returns the hit in world space.
 *
 * @param mesh Mesh to test.
 * @param worldOrigin World ray origin.
 * @param worldDirection Unit world ray direction.
 * @param maxDistance Maximum world distance.
 * @param frontFacingOnly When true, reject back faces.
 * @returns Closest hit, or null.
 */
function raycastMeshBvh(
  mesh: THREE.Mesh,
  worldOrigin: THREE.Vector3,
  worldDirection: THREE.Vector3,
  maxDistance: number,
  frontFacingOnly: boolean,
): MeshBvhWorldHit | null {
  const bvh = getOrBuildFacePickBvh(mesh);
  if (!bvh) {
    return null;
  }
  mesh.updateMatrixWorld(true);
  writeLocalRay(mesh.matrixWorld, worldOrigin, worldDirection);
  const hit = frontFacingOnly
    ? bvh.raycastFrontFacing(scratchLocalOrigin, scratchLocalDirection, maxDistance)
    : bvh.raycastDoubleSided(scratchLocalOrigin, scratchLocalDirection, maxDistance);
  return hit ? worldHitFromLocal(mesh.matrixWorld, worldOrigin, hit) : null;
}

/**
 * Writes the world ray into mesh-local space without normalizing the direction.
 * The resulting parameter matches world distance when the world direction is
 * unit length.
 *
 * @param matrixWorld Mesh world matrix.
 * @param worldOrigin World ray origin.
 * @param worldDirection Unit world ray direction.
 */
function writeLocalRay(matrixWorld: THREE.Matrix4, worldOrigin: THREE.Vector3, worldDirection: THREE.Vector3): void {
  scratchInverse.copy(matrixWorld).invert();
  scratchLocalOrigin.copy(worldOrigin).applyMatrix4(scratchInverse);
  scratchLocalEnd.copy(worldOrigin).add(worldDirection).applyMatrix4(scratchInverse);
  scratchLocalDirection.copy(scratchLocalEnd).sub(scratchLocalOrigin);
}

/**
 * Converts a local BVH hit into world space.
 *
 * @param matrixWorld Mesh world matrix.
 * @param worldOrigin World ray origin.
 * @param hit Local BVH hit.
 * @returns World hit.
 */
function worldHitFromLocal(
  matrixWorld: THREE.Matrix4,
  worldOrigin: THREE.Vector3,
  hit: TriangleBvhHit,
): MeshBvhWorldHit {
  scratchWorldPoint.copy(hit.point).applyMatrix4(matrixWorld);
  return {
    triangleIndex: hit.faceIndex,
    distance: worldOrigin.distanceTo(scratchWorldPoint),
    point: scratchWorldPoint.clone(),
  };
}
