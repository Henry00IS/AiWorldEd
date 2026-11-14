import * as THREE from 'three';
import { isWorldPointUnoccluded } from '@/edit/pick/edit_component_occlusion.js';
import { raycastMeshBvhDoubleSided } from '@/edit/pick/edit_component_bvh_ray.js';
import { SOLID_TRIANGLE_SOURCES_USERDATA_KEY } from '@/solid/model/solid_model_keys.js';

/** Depth slack so a point lying on a surface is not hidden by that surface. */
const SNAP_OCCLUSION_DEPTH_BIAS = 0.08;

/** Step past a skipped triangle before casting again. */
const SNAP_OCCLUSION_SKIP_STEP = 1e-4;

/** Most skipped triangles one occluder may contribute along a ray. */
const SNAP_OCCLUSION_MAX_SKIPS = 64;

const occlusionRaycaster = new THREE.Raycaster();
const scratchNdc = new THREE.Vector3();
const scratchStart = new THREE.Vector3();

/**
 * Returns whether a world point is visible from the camera, ignoring result
 * triangles that belong to moving brushes.
 *
 * @param point World point to test.
 * @param camera Camera.
 * @param occluders Meshes that may hide the point.
 * @param movingOwnerIds Brush ids whose result triangles are skipped.
 * @returns True when nothing else is in front of the point.
 */
export function snapWorldPointUnoccluded(
  point: THREE.Vector3,
  camera: THREE.Camera,
  occluders: readonly THREE.Mesh[],
  movingOwnerIds: ReadonlySet<string>,
): boolean {
  if (movingOwnerIds.size === 0 || occluders.length === 0) {
    return isWorldPointUnoccluded(point, camera, occluders);
  }
  if (!snapOcclusionRayAim(point, camera)) {
    return false;
  }
  const pointDistance = occlusionRaycaster.ray.origin.distanceTo(point);
  const limit = pointDistance - SNAP_OCCLUSION_DEPTH_BIAS;
  return occluders.every((mesh) => snapOcclusionFirstBlock(mesh, limit, movingOwnerIds) === null);
}

/**
 * Points the occlusion ray from the camera through a world point.
 *
 * @param point World point.
 * @param camera Camera.
 * @returns False when the point is outside the camera depth range.
 */
function snapOcclusionRayAim(point: THREE.Vector3, camera: THREE.Camera): boolean {
  camera.updateMatrixWorld(true);
  scratchNdc.copy(point).project(camera);
  if (scratchNdc.z < -1 || scratchNdc.z > 1) {
    return false;
  }
  occlusionRaycaster.setFromCamera(new THREE.Vector2(scratchNdc.x, scratchNdc.y), camera);
  return true;
}

/**
 * Returns the distance of the first triangle of a mesh that blocks the ray
 * before a limit, stepping past triangles of moving brushes.
 *
 * @param mesh Occluder mesh.
 * @param limit Distance beyond which nothing counts as blocking.
 * @param movingOwnerIds Brush ids whose result triangles are skipped.
 * @returns Blocking distance, or null when the ray is clear.
 */
function snapOcclusionFirstBlock(mesh: THREE.Mesh, limit: number, movingOwnerIds: ReadonlySet<string>): number | null {
  const origin = occlusionRaycaster.ray.origin;
  const direction = occlusionRaycaster.ray.direction;
  let travelled = 0;
  for (let skips = 0; skips < SNAP_OCCLUSION_MAX_SKIPS && travelled < limit; skips++) {
    scratchStart.copy(origin).addScaledVector(direction, travelled);
    const hit = raycastMeshBvhDoubleSided(mesh, scratchStart, direction, limit - travelled);
    if (!hit) return null;
    if (!snapOcclusionTriangleIsMoving(mesh, hit.triangleIndex, movingOwnerIds)) return travelled + hit.distance;
    travelled += hit.distance + SNAP_OCCLUSION_SKIP_STEP;
  }
  return null;
}

/**
 * Returns whether a result-mesh triangle comes from a moving brush.
 *
 * @param mesh Occluder mesh.
 * @param triangleIndex Triangle index on the mesh.
 * @param movingOwnerIds Brush ids that are moving.
 * @returns True when the triangle belongs to a moving brush.
 */
function snapOcclusionTriangleIsMoving(
  mesh: THREE.Mesh,
  triangleIndex: number,
  movingOwnerIds: ReadonlySet<string>,
): boolean {
  const sources = mesh.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY] as Array<{ brushId?: string }> | undefined;
  const brushId = sources?.[triangleIndex]?.brushId;
  return brushId !== undefined && movingOwnerIds.has(brushId);
}
