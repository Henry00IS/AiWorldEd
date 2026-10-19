import * as THREE from 'three';
import { SELECTION_HIGHLIGHT_USERDATA_KEY } from '@/selection/object/selection_highlight.js';
import { DECORATIVE_EDGE_USERDATA_KEY } from '@/utils/mesh_edge_sync.js';
import { SOLID_BRUSH_EDGE_USERDATA_KEY } from '@/solid/model/solid_brush_edge_materials.js';
import { MODIFIER_VOLUME_BEVEL_USERDATA_KEY } from '@/modifier/volume/modifier_volume_bevel_keys.js';

/** Default distance ahead of the camera when nothing occludes the view ray. */
export const DEFAULT_SPAWN_DISTANCE = 8;

/** Fallback grid interval when snap settings are unavailable or invalid. */
export const FALLBACK_GRID_INTERVAL = 1;

/** Minimum spawn distance from the camera along the view ray. */
const MINIMUM_SPAWN_DISTANCE = 0.5;

/**
 * Tiny epsilon so face-adjacent spawns do not Z-fight; not a full grid cell.
 * Larger gaps came from stepping outward by whole snap intervals.
 */
const SURFACE_CLEARANCE = 1e-4;

/** Scratch vectors reused during spawn placement. */
const _origin = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _scratchOffset = new THREE.Vector3();

/**
 * Computes a world position along the camera view forward at a fixed distance.
 * Does not snap or raycast; prefer {@link computeOcclusionAwareSpawnPosition}
 * for interactive placement.
 *
 * @param camera Active view camera.
 * @param distance Distance along the view forward from the camera origin.
 * @returns World-space position (unsnapped).
 */
export function computeCameraForwardSpawnPosition(
  camera: THREE.Camera,
  distance: number = DEFAULT_SPAWN_DISTANCE,
): THREE.Vector3 {
  const position = new THREE.Vector3();
  const forward = new THREE.Vector3();
  readCameraRay(camera, position, forward);
  position.addScaledVector(forward, Math.max(distance, 0));
  return position;
}

/** Inputs for view-ray spawn placement. */
export interface SpawnPlacementOptions {
  /** Active view camera. */
  camera: THREE.Camera;
  /** Preferred distance along the view ray. */
  preferredDistance?: number;
  /** Grid step. Non-positive values skip snap. */
  gridInterval?: number;
  /** Hierarchy searched for occluders. */
  raycastRoot?: THREE.Object3D | null;
  /** Half-extent used for surface clearance. */
  objectRadius?: number;
  /** When true, modifier volumes do not stop the ray. */
  ignoreModifierVolumes?: boolean;
}

/**
 * Places an object in view: open-space preferred distance when clear, otherwise
 * in the gap between the camera and the closest hit along the view ray so the
 * object sits in front of that surface. Grid snap is pulled back along the ray
 * when it would cross the clearance plane.
 *
 * @param options Placement inputs including camera and optional scene root.
 * @returns World-space spawn position, optionally grid-snapped.
 */
export function computeOcclusionAwareSpawnPosition(options: SpawnPlacementOptions): THREE.Vector3 {
  const preferred = Math.max(options.preferredDistance ?? DEFAULT_SPAWN_DISTANCE, MINIMUM_SPAWN_DISTANCE);
  const radius = Math.max(options.objectRadius ?? 0.5, 0.01);
  const gridInterval = resolveOptionalGridInterval(options.gridInterval);
  readCameraRay(options.camera, _origin, _forward);
  const hit = findFirstBlockingHit(options, preferred);
  if (!hit) return placeInOpenSpace(_origin, _forward, preferred, gridInterval);
  return placeInGapBeforeHit(hit, _origin, _forward, radius, gridInterval, preferred);
}

/**
 * Returns a positive snap step, or 0 when snap is off.
 *
 * @param gridInterval Requested step.
 * @returns Step used by open-space and gap placement.
 */
function resolveOptionalGridInterval(gridInterval: number | undefined): number {
  if (gridInterval === undefined || gridInterval <= 0) return 0;
  return gridInterval;
}

/**
 * Snaps a position to the nearest grid cell on each axis.
 *
 * @param position Position modified in place.
 * @param gridInterval Grid step (non-positive values leave the position
 *   unchanged).
 */
export function snapPositionToGrid(position: THREE.Vector3, gridInterval: number): void {
  const interval = resolveGridInterval(gridInterval);
  position.x = Math.round(position.x / interval) * interval;
  position.y = Math.round(position.y / interval) * interval;
  position.z = Math.round(position.z / interval) * interval;
}

/**
 * Places at the preferred open-space distance along the view ray.
 *
 * @param origin Camera world position.
 * @param forward Normalized view forward.
 * @param preferred Preferred distance.
 * @param gridInterval Grid step, or 0 to skip snap.
 * @returns Spawn position.
 */
function placeInOpenSpace(
  origin: THREE.Vector3,
  forward: THREE.Vector3,
  preferred: number,
  gridInterval: number,
): THREE.Vector3 {
  const position = origin.clone().addScaledVector(forward, preferred);
  if (gridInterval > 0) {
    snapPositionToGrid(position, gridInterval);
  }
  return position;
}

/**
 * Places along the view ray in the gap between the camera and the closest hit,
 * leaving object-radius clearance in front of the surface.
 *
 * @param hit First blocking ray hit.
 * @param origin Camera world position.
 * @param forward Normalized view forward.
 * @param objectRadius Half-extent of the new object.
 * @param gridInterval Grid step, or 0 to skip snap.
 * @param preferred Preferred open-space distance (caps how far along the ray).
 * @returns Spawn position between the camera and the hit.
 */
function placeInGapBeforeHit(
  hit: THREE.Intersection,
  origin: THREE.Vector3,
  forward: THREE.Vector3,
  objectRadius: number,
  gridInterval: number,
  preferred: number,
): THREE.Vector3 {
  const maxCenterDistance = computeMaxCenterDistanceBeforeHit(hit, origin, forward, objectRadius, preferred);
  const position = origin.clone().addScaledVector(forward, maxCenterDistance);
  if (gridInterval > 0) {
    snapKeepingInFrontOfHit(position, origin, forward, maxCenterDistance, gridInterval);
  }
  return position;
}

/**
 * Computes the farthest safe center distance along the view ray that stays in
 * front of the hit with radius clearance, never behind the camera, and never
 * past the preferred open-space distance.
 *
 * @param hit Closest blocking ray hit.
 * @param origin Camera world position.
 * @param forward Normalized view forward.
 * @param objectRadius Half-extent of the new object.
 * @param preferred Preferred open-space distance along the ray.
 * @returns Distance along the view forward for the spawn center.
 */
function computeMaxCenterDistanceBeforeHit(
  hit: THREE.Intersection,
  origin: THREE.Vector3,
  forward: THREE.Vector3,
  objectRadius: number,
  preferred: number,
): number {
  const minSeparation = objectRadius + SURFACE_CLEARANCE;
  const hitDistance = Math.max(hit.distance, 0);
  const pullBack = computeAlongRayPullBack(hit, origin, forward, minSeparation);
  const gapBeforeHit = Math.max(hitDistance - pullBack, 0);
  if (gapBeforeHit <= 0) {
    return 0;
  }
  return Math.min(preferred, gapBeforeHit);
}

/**
 * Computes how far to pull the center back from the hit along the view ray so a
 * sphere of the given separation stays on the free side of the hit plane.
 *
 * @param hit Closest blocking ray hit.
 * @param origin Camera world position.
 * @param forward Normalized view forward.
 * @param minSeparation Minimum center-to-surface distance.
 * @returns Pull-back distance along the view ray from the hit.
 */
function computeAlongRayPullBack(
  hit: THREE.Intersection,
  origin: THREE.Vector3,
  forward: THREE.Vector3,
  minSeparation: number,
): number {
  if (!hit.face) {
    return minSeparation;
  }
  resolveOutwardNormal(hit, origin, _normal);
  const forwardDotNormal = forward.dot(_normal);
  if (forwardDotNormal >= -1e-6) {
    return minSeparation;
  }
  return minSeparation / -forwardDotNormal;
}

/**
 * Builds a unit outward normal for the hit that faces the camera.
 *
 * @param hit Raycast intersection.
 * @param cameraOrigin Camera world position.
 * @param outwardNormal Output normal.
 */
function resolveOutwardNormal(
  hit: THREE.Intersection,
  cameraOrigin: THREE.Vector3,
  outwardNormal: THREE.Vector3,
): void {
  if (hit.face) {
    outwardNormal.copy(hit.face.normal);
    if (hit.object) {
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
      outwardNormal.applyMatrix3(normalMatrix).normalize();
    }
  } else {
    outwardNormal.copy(cameraOrigin).sub(hit.point).normalize();
  }
  const toCamera = cameraOrigin.clone().sub(hit.point);
  if (outwardNormal.dot(toCamera) < 0) {
    outwardNormal.negate();
  }
  if (outwardNormal.lengthSq() < 1e-12) {
    outwardNormal.copy(toCamera).normalize();
  }
}

/**
 * Snaps to the grid, then pulls the center back along the view ray if snap
 * moved it past the clearance plane or behind the camera.
 *
 * @param position Candidate spawn center.
 * @param origin Camera world position.
 * @param forward Normalized view forward.
 * @param maxCenterDistance Farthest allowed distance along the ray.
 * @param gridInterval Grid step.
 */
function snapKeepingInFrontOfHit(
  position: THREE.Vector3,
  origin: THREE.Vector3,
  forward: THREE.Vector3,
  maxCenterDistance: number,
  gridInterval: number,
): void {
  snapPositionToGrid(position, gridInterval);
  const alongRay = _scratchOffset.copy(position).sub(origin).dot(forward);
  if (alongRay > maxCenterDistance + 1e-9) {
    position.addScaledVector(forward, maxCenterDistance - alongRay);
    return;
  }
  if (alongRay < -1e-9) {
    position.addScaledVector(forward, -alongRay);
  }
}

/**
 * Resolves a positive grid interval, falling back when invalid.
 *
 * @param gridInterval Candidate interval.
 * @returns Safe positive grid step.
 */
function resolveGridInterval(gridInterval: number): number {
  return Number.isFinite(gridInterval) && gridInterval > 0 ? gridInterval : FALLBACK_GRID_INTERVAL;
}

/**
 * Reads the camera world origin and normalized look direction.
 *
 * @param camera Active camera.
 * @param origin Output world position.
 * @param forward Output normalized world forward.
 */
function readCameraRay(camera: THREE.Camera, origin: THREE.Vector3, forward: THREE.Vector3): void {
  camera.getWorldPosition(origin);
  camera.getWorldDirection(forward);
  if (forward.lengthSq() < 1e-12) {
    forward.set(0, 0, -1);
    return;
  }
  forward.normalize();
}

/**
 * Finds the nearest content mesh hit along the camera view ray within range.
 *
 * @param options Placement inputs whose root and volume flag select occluders.
 * @param maxDistance Maximum ray length.
 * @returns Nearest hit, or null.
 */
function findFirstBlockingHit(options: SpawnPlacementOptions, maxDistance: number): THREE.Intersection | null {
  const root = options.raycastRoot ?? null;
  if (!root) return null;
  const targets = collectSpawnRaycastMeshes(root, options.ignoreModifierVolumes === true);
  if (targets.length === 0) return null;
  return nearestSpawnHit(options.camera, targets, maxDistance);
}

/**
 * Returns the closest hit among meshes already accepted as occluders.
 *
 * @param camera Active camera.
 * @param targets Meshes the ray may hit.
 * @param maxDistance Maximum ray length.
 * @returns Nearest hit, or null.
 */
function nearestSpawnHit(camera: THREE.Camera, targets: THREE.Mesh[], maxDistance: number): THREE.Intersection | null {
  const raycaster = new THREE.Raycaster(_origin, _forward, 0, Math.max(maxDistance, MINIMUM_SPAWN_DISTANCE));
  raycaster.camera = camera;
  const hits = raycaster.intersectObjects(targets, false);
  return hits[0] ?? null;
}

/**
 * Collects meshes that should occlude object spawn placement.
 *
 * @param root Scene hierarchy root.
 * @param ignoreModifierVolumes True when modifier volumes are not blockers.
 * @returns Content meshes suitable for spawn raycasts.
 */
function collectSpawnRaycastMeshes(root: THREE.Object3D, ignoreModifierVolumes: boolean): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (isSpawnRaycastMesh(object, ignoreModifierVolumes)) meshes.push(object);
  });
  return meshes;
}

/**
 * Returns whether an object is a solid content mesh for spawn occlusion tests.
 *
 * @param object Candidate scene object.
 * @param ignoreModifierVolumes True when modifier volumes are not blockers.
 * @returns True for raycastable content meshes.
 */
export function isSpawnRaycastMesh(object: THREE.Object3D, ignoreModifierVolumes = false): object is THREE.Mesh {
  if (!(object instanceof THREE.Mesh)) return false;
  if (!object.visible) return false;
  if (ignoresSpawnOcclusion(object, ignoreModifierVolumes)) return false;
  return true;
}

/**
 * Returns whether spawn occlusion should skip this object.
 *
 * @param object Candidate scene object.
 * @param ignoreModifierVolumes True when modifier volumes are not blockers.
 * @returns True when the object must not stop a spawn ray.
 */
function ignoresSpawnOcclusion(object: THREE.Object3D, ignoreModifierVolumes: boolean): boolean {
  if (object.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] === true) return true;
  if (object.userData[DECORATIVE_EDGE_USERDATA_KEY] === true) return true;
  if (object.userData[SOLID_BRUSH_EDGE_USERDATA_KEY] === true) return true;
  if (object.userData['isWireframeOverlay'] === true) return true;
  if (object.userData['isBoundsFacePick'] === true) return true;
  if (object.userData['isBoundsGuideLines'] === true) return true;
  if (object.userData['isClipPlanePreview'] === true) return true;
  if (object.userData['isCadRuler'] === true) return true;
  if (object.userData['isGizmoOccludedGhost'] === true) return true;
  return ignoreModifierVolumes && object.userData[MODIFIER_VOLUME_BEVEL_USERDATA_KEY] === true;
}
