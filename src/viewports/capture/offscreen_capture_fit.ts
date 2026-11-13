import * as THREE from 'three';
import { CameraFramer } from '@/navigation/camera/camera_framer.js';
import { BoundingVolumeComputer } from '@/navigation/placement/bounding_volume_computer.js';

/** Named camera side for fit framing. Default is isometric (1,1,1 diagonal). */
export type OffscreenCaptureSide = 'iso' | 'front' | 'back' | 'top' | 'bottom' | 'left' | 'right';

/** Result of fitting a perspective camera to world content bounds. */
export interface CaptureFitResult {
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
  up: THREE.Vector3;
}

/**
 * Fits a perspective camera to meshes using the same pipeline as the editor
 * F-key fit: mesh world AABBs via {@link BoundingVolumeComputer}, then
 * {@link CameraFramer}. Verifies all box corners sit in the frustum and pulls
 * the camera back if needed so subjects are not half off-screen.
 *
 * @param camera Perspective camera (aspect should match the capture, usually
 *   1).
 * @param meshes Subject meshes to frame (brush previews or CSG results).
 * @param view Named view side for the look direction.
 * @param paddingFactor Padding multiplier (>= 1).
 * @param distanceOffset Extra world units to pull back after fit.
 * @returns Camera pose with subject centered on the optical axis.
 */
export function fitCaptureCameraToMeshes(
  camera: THREE.PerspectiveCamera,
  meshes: THREE.Mesh[],
  view: OffscreenCaptureSide,
  paddingFactor: number,
  distanceOffset: number | undefined,
): CaptureFitResult {
  const bounds = new BoundingVolumeComputer().computeWorldBoundingBox(meshes);
  if (bounds.isEmpty()) {
    throw new Error('capture_view: subject bounds are empty');
  }
  return fitCaptureCameraToBounds(camera, bounds, view, paddingFactor, distanceOffset);
}

/**
 * Fits a perspective camera to a world AABB (same math path as mesh fit).
 *
 * @param camera Perspective camera.
 * @param bounds World-space bounds to frame.
 * @param view Named view side.
 * @param paddingFactor Padding multiplier (>= 1).
 * @param distanceOffset Extra pull-back after fit.
 * @returns Camera pose.
 */
export function fitCaptureCameraToBounds(
  camera: THREE.PerspectiveCamera,
  bounds: THREE.Box3,
  view: OffscreenCaptureSide,
  paddingFactor: number,
  distanceOffset: number | undefined,
): CaptureFitResult {
  camera.aspect = 1;
  camera.updateProjectionMatrix();
  const up = cameraUpForView(view);
  const lookAt = bounds.getCenter(new THREE.Vector3());
  seedCameraOnViewSide(camera, lookAt, bounds, view, up);
  const padding = Math.max(paddingFactor, 1);
  const framer = new CameraFramer();
  const target = framer.computePerspectiveTarget(bounds, camera, padding);
  let position = target.targetPosition.clone();
  const focus = target.targetLookAt.clone();
  applyDistanceOffsetAlongView(position, focus, distanceOffset);
  position = ensureBoundsInsideFrustum(camera, bounds, position, focus, up);
  return { position, lookAt: focus, up };
}

/**
 * Returns true when every corner of a world box projects inside the NDC cube
 * (with a small margin).
 *
 * @param camera Posed perspective camera.
 * @param bounds World bounds.
 * @param ndcMargin Maximum absolute NDC coordinate allowed (e.g. 0.98).
 * @returns True when the full box is on-screen.
 */
export function areBoundsInsideCameraFrustum(
  camera: THREE.PerspectiveCamera,
  bounds: THREE.Box3,
  ndcMargin: number = 0.98,
): boolean {
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  const matrix = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const corners = listBoxCorners(bounds);
  const clip = new THREE.Vector4();
  for (const corner of corners) {
    clip.set(corner.x, corner.y, corner.z, 1).applyMatrix4(matrix);
    if (Math.abs(clip.w) < 1e-8) {
      return false;
    }
    const ndcX = clip.x / clip.w;
    const ndcY = clip.y / clip.w;
    const ndcZ = clip.z / clip.w;
    if (Math.abs(ndcX) > ndcMargin || Math.abs(ndcY) > ndcMargin || ndcZ < -1 || ndcZ > 1) {
      return false;
    }
  }
  return true;
}

/**
 * Pulls the camera back along the view axis until the bounds fit in the
 * frustum.
 *
 * @param camera Perspective camera used for projection tests.
 * @param bounds Subject bounds.
 * @param position Initial camera position.
 * @param lookAt Look-at point (box center).
 * @param up Camera up vector.
 * @returns Adjusted camera position.
 */
function ensureBoundsInsideFrustum(
  camera: THREE.PerspectiveCamera,
  bounds: THREE.Box3,
  position: THREE.Vector3,
  lookAt: THREE.Vector3,
  up: THREE.Vector3,
): THREE.Vector3 {
  const adjusted = position.clone();
  for (let attempt = 0; attempt < 12; attempt++) {
    poseCamera(camera, adjusted, lookAt, up);
    if (areBoundsInsideCameraFrustum(camera, bounds, 0.92)) {
      return adjusted;
    }
    const away = adjusted.clone().sub(lookAt);
    if (away.lengthSq() < 1e-8) {
      away.set(1, 1, 1);
    }
    away.normalize();
    const step = Math.max(adjusted.distanceTo(lookAt) * 0.35, 0.5);
    adjusted.addScaledVector(away, step);
  }
  return adjusted;
}

/**
 * Seeds camera orientation for CameraFramer (preserves view direction).
 *
 * @param camera Camera to seed.
 * @param lookAt Subject center.
 * @param bounds Subject bounds (for distance scale).
 * @param view Named view side.
 * @param up Camera up.
 */
function seedCameraOnViewSide(
  camera: THREE.PerspectiveCamera,
  lookAt: THREE.Vector3,
  bounds: THREE.Box3,
  view: OffscreenCaptureSide,
  up: THREE.Vector3,
): void {
  const size = bounds.getSize(new THREE.Vector3());
  const extent = Math.max(size.x, size.y, size.z, 1);
  const seedDistance = extent * 2.5;
  const position = lookAt.clone().addScaledVector(viewSideDirection(view), seedDistance);
  poseCamera(camera, position, lookAt, up);
}

/**
 * Applies position, up, and lookAt to a camera and updates matrices.
 *
 * @param camera Target camera.
 * @param position World position.
 * @param lookAt World look-at.
 * @param up Up vector.
 */
function poseCamera(
  camera: THREE.PerspectiveCamera,
  position: THREE.Vector3,
  lookAt: THREE.Vector3,
  up: THREE.Vector3,
): void {
  camera.position.copy(position);
  camera.up.copy(up);
  camera.lookAt(lookAt);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
}

/**
 * Pulls the camera backward along the view axis by distanceOffset.
 *
 * @param position Camera position to adjust.
 * @param lookAt Look-at point.
 * @param distanceOffset Extra world units backward.
 */
function applyDistanceOffsetAlongView(
  position: THREE.Vector3,
  lookAt: THREE.Vector3,
  distanceOffset: number | undefined,
): void {
  if (typeof distanceOffset !== 'number' || !Number.isFinite(distanceOffset) || distanceOffset === 0) {
    return;
  }
  const away = position.clone().sub(lookAt);
  if (away.lengthSq() < 1e-12) {
    return;
  }
  away.normalize();
  position.addScaledVector(away, distanceOffset);
}

/**
 * Unit offset from subject toward the camera for a named view side.
 *
 * @param view Named view side.
 * @returns Direction from look-at toward camera.
 */
export function viewSideDirection(view: OffscreenCaptureSide): THREE.Vector3 {
  switch (view) {
    case 'front':
      return new THREE.Vector3(0, 0, 1);
    case 'back':
      return new THREE.Vector3(0, 0, -1);
    case 'top':
      return new THREE.Vector3(0, 1, 0);
    case 'bottom':
      return new THREE.Vector3(0, -1, 0);
    case 'right':
      return new THREE.Vector3(1, 0, 0);
    case 'left':
      return new THREE.Vector3(-1, 0, 0);
    case 'iso':
    default:
      return new THREE.Vector3(1, 1, 1).normalize();
  }
}

/**
 * Returns the camera up vector for a named view side.
 *
 * @param view Named view side.
 * @returns Up vector.
 */
export function cameraUpForView(view: OffscreenCaptureSide): THREE.Vector3 {
  if (view === 'top' || view === 'bottom') {
    return new THREE.Vector3(0, 0, -1);
  }
  return new THREE.Vector3(0, 1, 0);
}

/**
 * Lists the eight corners of a box.
 *
 * @param bounds World box.
 * @returns Corner positions.
 */
function listBoxCorners(bounds: THREE.Box3): THREE.Vector3[] {
  const min = bounds.min;
  const max = bounds.max;
  return [
    new THREE.Vector3(min.x, min.y, min.z),
    new THREE.Vector3(min.x, min.y, max.z),
    new THREE.Vector3(min.x, max.y, min.z),
    new THREE.Vector3(min.x, max.y, max.z),
    new THREE.Vector3(max.x, min.y, min.z),
    new THREE.Vector3(max.x, min.y, max.z),
    new THREE.Vector3(max.x, max.y, min.z),
    new THREE.Vector3(max.x, max.y, max.z),
  ];
}
