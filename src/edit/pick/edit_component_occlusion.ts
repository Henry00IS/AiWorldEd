import * as THREE from 'three';
import { pointerEventToNdc } from '@/utils/pointer_ndc.js';

/**
 * World-space slack so surface verts/edges are not rejected by depth noise on
 * dense meshes. Kept small so verts clearly behind a solid face stay blocked.
 */
const SURFACE_DEPTH_BIAS = 0.08;

/** Scratch NDC for view-ray occlusion through a world point. */
const scratchProjectedNdc = new THREE.Vector2();

/** Scratch projected world point for NDC. */
const scratchProjectedWorld = new THREE.Vector3();

/** Shared raycaster for occlusion queries. */
const occlusionRaycaster = new THREE.Raycaster();

/**
 * Returns whether component picks should run depth occlusion for this camera.
 * Always true: Edit Mode only selects vertices/edges that are not hidden behind
 * solid domain geometry (perspective and orthographic).
 *
 * @param _camera Active viewport camera.
 * @returns True when occlusion filtering should run.
 */
export function shouldApplyComponentPickOcclusion(_camera: THREE.Camera): boolean {
  return true;
}

/**
 * Measures the nearest mesh hit distance along the pick ray (pointer-centered).
 *
 * @param event Pointer event.
 * @param camera Camera.
 * @param pickElement Pick element.
 * @param meshes Domain meshes used as occluders.
 * @returns Closest hit distance from the ray origin, or null when none.
 */
export function measureClosestOccluderDistance(
  event: MouseEvent,
  camera: THREE.Camera,
  pickElement: HTMLElement,
  meshes: readonly THREE.Mesh[],
): number | null {
  if (meshes.length === 0) {
    return null;
  }
  camera.updateMatrixWorld(true);
  const ndc = pointerEventToNdc(event, pickElement);
  occlusionRaycaster.setFromCamera(ndc, camera);
  const hits = raycastOccludersDoubleSided(meshes);
  if (hits.length === 0) {
    return null;
  }
  return hits[0]!.distance;
}

/**
 * Returns whether a world point is visible along the camera view ray through
 * that point. Uses setFromCamera so orthographic parallel rays stay correct.
 *
 * @param worldPoint Candidate world point.
 * @param camera Camera.
 * @param meshes Domain occluder meshes.
 * @returns True when nothing is substantially closer along the view ray.
 */
export function isWorldPointUnoccluded(
  worldPoint: THREE.Vector3,
  camera: THREE.Camera,
  meshes: readonly THREE.Mesh[],
): boolean {
  if (meshes.length === 0) {
    return true;
  }
  camera.updateMatrixWorld(true);
  if (!configureViewRayThroughWorldPoint(camera, worldPoint)) {
    return false;
  }
  const pointDistance = occlusionRaycaster.ray.origin.distanceTo(worldPoint);
  if (pointDistance <= 1e-8) {
    return true;
  }
  const hits = raycastOccludersDoubleSided(meshes);
  if (hits.length === 0) {
    return true;
  }
  return hits[0]!.distance >= pointDistance - SURFACE_DEPTH_BIAS;
}

/**
 * Returns whether a world point is in front of (or on) the first mesh hit along
 * the pointer ray.
 *
 * @param worldPoint Candidate world point.
 * @param camera Camera.
 * @param event Pointer event.
 * @param pickElement Pick element.
 * @param occluderDistance Closest mesh hit distance, or null when open air.
 * @returns True when the point is not occluded by domain geometry.
 */
export function isWorldPointVisibleForPick(
  worldPoint: THREE.Vector3,
  camera: THREE.Camera,
  event: MouseEvent,
  pickElement: HTMLElement,
  occluderDistance: number | null,
): boolean {
  if (occluderDistance === null) {
    return true;
  }
  camera.updateMatrixWorld(true);
  const ndc = pointerEventToNdc(event, pickElement);
  occlusionRaycaster.setFromCamera(ndc, camera);
  const origin = occlusionRaycaster.ray.origin;
  const pointDistance = origin.distanceTo(worldPoint);
  return pointDistance <= occluderDistance + SURFACE_DEPTH_BIAS;
}

/**
 * Returns whether an edge is pickable: the world sample nearest the pointer on
 * the edge must be unoccluded (not merely any endpoint in free air).
 *
 * @param worldA Edge start.
 * @param worldB Edge end.
 * @param sampleWorld Point on the edge used for the visibility test.
 * @param camera Camera.
 * @param meshes Domain occluder meshes.
 * @returns True when the sample point is not occluded.
 */
export function isWorldEdgeSampleUnoccluded(
  worldA: THREE.Vector3,
  worldB: THREE.Vector3,
  sampleWorld: THREE.Vector3,
  camera: THREE.Camera,
  meshes: readonly THREE.Mesh[],
): boolean {
  void worldA;
  void worldB;
  return isWorldPointUnoccluded(sampleWorld, camera, meshes);
}

/**
 * Returns whether an edge is visible for pick using view rays through the
 * midpoint and endpoints. Prefer {@link isWorldEdgeSampleUnoccluded} for
 * pointer-driven picks.
 *
 * @param worldA Edge start.
 * @param worldB Edge end.
 * @param camera Camera.
 * @param meshes Domain occluder meshes.
 * @returns True when any sample point is not occluded.
 */
export function isWorldEdgeUnoccluded(
  worldA: THREE.Vector3,
  worldB: THREE.Vector3,
  camera: THREE.Camera,
  meshes: readonly THREE.Mesh[],
): boolean {
  const midpoint = worldA.clone().add(worldB).multiplyScalar(0.5);
  if (isWorldPointUnoccluded(midpoint, camera, meshes)) {
    return true;
  }
  if (isWorldPointUnoccluded(worldA, camera, meshes)) {
    return true;
  }
  return isWorldPointUnoccluded(worldB, camera, meshes);
}

/**
 * Configures the shared raycaster as the camera view ray through a world point.
 *
 * @param camera Camera.
 * @param worldPoint World point the ray must pass through.
 * @returns False when the point is outside the clip volume.
 */
function configureViewRayThroughWorldPoint(camera: THREE.Camera, worldPoint: THREE.Vector3): boolean {
  scratchProjectedWorld.copy(worldPoint).project(camera);
  if (scratchProjectedWorld.z < -1 || scratchProjectedWorld.z > 1) {
    return false;
  }
  scratchProjectedNdc.set(scratchProjectedWorld.x, scratchProjectedWorld.y);
  occlusionRaycaster.setFromCamera(scratchProjectedNdc, camera);
  return true;
}

/**
 * Raycasts occluder meshes with temporary DoubleSide materials so single-sided
 * shells still block picks when viewed from either side.
 *
 * @param meshes Occluder meshes.
 * @returns Sorted intersections.
 */
function raycastOccludersDoubleSided(meshes: readonly THREE.Mesh[]): THREE.Intersection[] {
  const restored: Array<{ material: THREE.Material; side: THREE.Side }> = [];
  for (const mesh of meshes) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material) {
        continue;
      }
      restored.push({ material, side: material.side });
      material.side = THREE.DoubleSide;
    }
  }
  const hits = occlusionRaycaster.intersectObjects([...meshes], false);
  for (const entry of restored) {
    entry.material.side = entry.side;
  }
  return hits;
}
