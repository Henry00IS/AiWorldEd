import * as THREE from 'three';

/**
 * Multiplier applied to estimated handle size for the radial dead zone before
 * rotate and scale lock their reference radius.
 */
export const UV_RADIAL_MIN_DIAMETER_FACTOR = 2;

/**
 * Estimates a world-space handle size at a pivot. Larger when the pivot is
 * farther from the camera so dead zones stay screen-stable.
 *
 * @param camera Active viewport camera.
 * @param worldPivot World pivot used for scale/rotate.
 * @returns Positive world-space size used for radial dead-zone thresholds.
 */
export function estimateUvHandleWorldSize(camera: THREE.Camera, worldPivot: THREE.Vector3): number {
  if (camera instanceof THREE.PerspectiveCamera) {
    return estimatePerspectiveHandleWorldSize(camera, worldPivot);
  }
  if (camera instanceof THREE.OrthographicCamera) {
    return estimateOrthographicHandleWorldSize(camera);
  }
  return 0.25;
}

/**
 * Minimum in-plane distance from the pivot before rotate/scale lock their
 * reference radius.
 *
 * @param camera Active viewport camera.
 * @param worldPivot World pivot.
 * @returns Minimum world-space radius before radial ops begin.
 */
export function computeUvRadialDeadZoneRadius(camera: THREE.Camera, worldPivot: THREE.Vector3): number {
  const handleSize = estimateUvHandleWorldSize(camera, worldPivot);
  return Math.max(1e-4, handleSize * UV_RADIAL_MIN_DIAMETER_FACTOR);
}

/**
 * Perspective handle size from distance and vertical FOV.
 *
 * @param camera Perspective camera.
 * @param worldPivot World pivot.
 * @returns World-space handle size.
 */
function estimatePerspectiveHandleWorldSize(camera: THREE.PerspectiveCamera, worldPivot: THREE.Vector3): number {
  const cameraPosition = new THREE.Vector3();
  camera.getWorldPosition(cameraPosition);
  const distance = Math.max(1e-4, cameraPosition.distanceTo(worldPivot));
  const halfFovRadians = (camera.fov * Math.PI) / 360;
  return distance * Math.tan(halfFovRadians) * 0.12;
}

/**
 * Orthographic handle size from the vertical frustum extent.
 *
 * @param camera Orthographic camera.
 * @returns World-space handle size.
 */
function estimateOrthographicHandleWorldSize(camera: THREE.OrthographicCamera): number {
  const verticalExtent = Math.abs(camera.top - camera.bottom);
  return Math.max(1e-4, verticalExtent * 0.05);
}
