import * as THREE from 'three';

const scratchNdc = new THREE.Vector3();
const scratchForward = new THREE.Vector3();
const scratchCameraPosition = new THREE.Vector3();
const scratchPixels = new THREE.Vector2();

/**
 * Projects a world point to CSS pixels. Returns null when the point is behind
 * the camera.
 *
 * @param point World point.
 * @param camera Camera.
 * @param viewportWidth Viewport width in CSS pixels.
 * @param viewportHeight Viewport height in CSS pixels.
 * @param target Pixel coordinate to fill.
 * @returns The target, or null when the point is behind the camera.
 */
export function snapProjectWorldToPixels(
  point: THREE.Vector3,
  camera: THREE.Camera,
  viewportWidth: number,
  viewportHeight: number,
  target: THREE.Vector2,
): THREE.Vector2 | null {
  if (!snapPointIsInFrontOfCamera(point, camera)) {
    return null;
  }
  scratchNdc.copy(point).project(camera);
  target.x = (scratchNdc.x * 0.5 + 0.5) * viewportWidth;
  target.y = (-scratchNdc.y * 0.5 + 0.5) * viewportHeight;
  return target;
}

/**
 * Distance in CSS pixels from the pointer to a world point.
 *
 * @param point World point.
 * @param camera Camera.
 * @param pointerPixels Pointer in CSS pixels.
 * @param viewportWidth Viewport width.
 * @param viewportHeight Viewport height.
 * @returns Pixel distance, or null when the point is behind the camera.
 */
export function snapScreenDistanceToPoint(
  point: THREE.Vector3,
  camera: THREE.Camera,
  pointerPixels: THREE.Vector2,
  viewportWidth: number,
  viewportHeight: number,
): number | null {
  const pixels = snapProjectWorldToPixels(point, camera, viewportWidth, viewportHeight, scratchPixels);
  if (!pixels) {
    return null;
  }
  return pixels.distanceTo(pointerPixels);
}

/**
 * Converts a pixel radius into world units at a distance from the camera.
 *
 * @param camera Camera.
 * @param distance Distance along the view.
 * @param pixelRadius Radius in CSS pixels.
 * @param viewportHeight Viewport height in CSS pixels.
 * @returns World-space radius.
 */
export function snapPixelRadiusToWorld(
  camera: THREE.Camera,
  distance: number,
  pixelRadius: number,
  viewportHeight: number,
): number {
  if (viewportHeight <= 0) {
    return 0;
  }
  if (camera instanceof THREE.OrthographicCamera) {
    return snapOrthoPixelRadius(camera, pixelRadius, viewportHeight);
  }
  if (camera instanceof THREE.PerspectiveCamera) {
    return snapPerspectivePixelRadius(camera, distance, pixelRadius, viewportHeight);
  }
  return 0;
}

/**
 * Returns whether a point is in front of the camera.
 *
 * @param point World point.
 * @param camera Camera.
 * @returns True when the point lies along the camera look direction.
 */
function snapPointIsInFrontOfCamera(point: THREE.Vector3, camera: THREE.Camera): boolean {
  camera.getWorldDirection(scratchForward);
  camera.getWorldPosition(scratchCameraPosition);
  return point.clone().sub(scratchCameraPosition).dot(scratchForward) > 1e-6;
}

/**
 * World radius of a pixel radius for a perspective camera.
 *
 * @param camera Perspective camera.
 * @param distance Distance from the camera.
 * @param pixelRadius Radius in CSS pixels.
 * @param viewportHeight Viewport height.
 * @returns World radius.
 */
function snapPerspectivePixelRadius(
  camera: THREE.PerspectiveCamera,
  distance: number,
  pixelRadius: number,
  viewportHeight: number,
): number {
  const halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5) * Math.max(distance, 1e-4);
  return (pixelRadius / viewportHeight) * halfHeight * 2;
}

/**
 * World radius of a pixel radius for an orthographic camera.
 *
 * @param camera Orthographic camera.
 * @param pixelRadius Radius in CSS pixels.
 * @param viewportHeight Viewport height.
 * @returns World radius.
 */
function snapOrthoPixelRadius(camera: THREE.OrthographicCamera, pixelRadius: number, viewportHeight: number): number {
  const worldHeight = (camera.top - camera.bottom) / Math.max(camera.zoom, 1e-6);
  return (pixelRadius / viewportHeight) * worldHeight;
}
