import * as THREE from 'three';
import type { OrientedBoundsData } from './oriented_bounds.js';

/**
 * On-screen pick size up close (approx CSS pixels). Stays at/above the visual
 * arrow so the cone stays easy to grab. Falls toward
 * {@link BOUNDS_CUBE_MIN_PIXELS} when zooming out.
 */
export const BOUNDS_CUBE_NEAR_PIXELS = 28;

/** Minimum on-screen pick edge so grips stay grabable when far. */
export const BOUNDS_CUBE_MIN_PIXELS = 16;

/** Near visual arrow size (doubled for readability). */
export const BOUNDS_CUBE_VISUAL_NEAR_PIXELS = 22;

/** Floor for visual arrow size when far. */
export const BOUNDS_CUBE_VISUAL_MIN_PIXELS = 10;

/**
 * Camera distance at which arrows use the full near pixel size. Beyond this,
 * on-screen size falls off toward the minimum.
 */
export const BOUNDS_CUBE_NEAR_DISTANCE = 6;

/**
 * Reference drawable height used when converting target pixels to world size.
 * Typical multi-view pane content height; exact per-pane height varies
 * slightly.
 */
export const BOUNDS_CUBE_REFERENCE_VIEWPORT_HEIGHT = 512;

/** Floor for perspective arrow pick world edge length. */
export const BOUNDS_CUBE_MIN_WORLD_SIZE = 0.04;

/** Hard ceiling on pick world edge length when flying extremely far. */
export const BOUNDS_CUBE_MAX_WORLD_SIZE = 1.6;

/** 2D ear length along the edge in CSS pixels (screen-space). */
export const BOUNDS_EAR_ALONG_PIXELS = 44;

/** 2D ear thickness in CSS pixels (screen-space) — thin drafting grips. */
export const BOUNDS_EAR_THICKNESS_PIXELS = 6;

/** Gap from bounds wire to ear center in CSS pixels. */
export const BOUNDS_EAR_OFFSET_PIXELS = 8;

/**
 * When a 2D ear's along-edge length would be shorter than this (CSS pixels),
 * the ear is hidden instead of rendering a stub.
 */
export const BOUNDS_EAR_MIN_ALONG_PIXELS = 8;

/**
 * Maximum fraction of a bounds side that a 2D ear may cover (when zoom makes
 * the pixel-sized ear longer than the brush edge).
 */
export const BOUNDS_EAR_MAX_SIDE_FRACTION = 0.5;

/** Exterior-only silhouette resize band thickness in CSS pixels. */
export const BOUNDS_SILHOUETTE_EXTERIOR_PIXELS = 10;

/**
 * OBB-relative ear size fallback when no orthographic camera is available.
 *
 * @param bounds Current OBB, or null.
 * @returns World-space base size for CAD ear layout.
 */
export function computeBoundsEarWorldSize(bounds: OrientedBoundsData | null): number {
  const minHalf = bounds ? Math.min(bounds.halfExtents.x, bounds.halfExtents.y, bounds.halfExtents.z) : 0.5;
  const size = Math.max(0.12, minHalf * 0.16);
  return Math.min(size, 0.34);
}

/**
 * World units corresponding to one CSS pixel for the given camera. Orthographic
 * uses the frustum height; perspective needs a distance (defaults to 1).
 *
 * @param camera Active camera.
 * @param viewportHeightPx Drawable pane height in CSS pixels.
 * @param perspectiveDistance Distance for perspective conversion (optional).
 * @returns World units per pixel.
 */
export function worldUnitsPerPixel(
  camera: THREE.Camera,
  viewportHeightPx: number,
  perspectiveDistance: number = 1,
): number {
  const heightPx = Math.max(1, viewportHeightPx);
  if (camera instanceof THREE.OrthographicCamera) {
    return Math.abs(camera.top - camera.bottom) / heightPx;
  }
  if (camera instanceof THREE.PerspectiveCamera) {
    const distance = Math.max(0.05, perspectiveDistance);
    const verticalFovRadians = THREE.MathUtils.degToRad(camera.fov);
    const worldHeight = 2 * distance * Math.tan(verticalFovRadians * 0.5);
    return worldHeight / heightPx;
  }
  return 1 / heightPx;
}

/**
 * Converts a screen-space size in CSS pixels to world units.
 *
 * @param camera Active camera.
 * @param pixels Edge length in CSS pixels.
 * @param viewportHeightPx Drawable pane height.
 * @param perspectiveDistance Optional distance for perspective cameras.
 * @returns World-space size.
 */
export function worldSizeFromScreenPixels(
  camera: THREE.Camera,
  pixels: number,
  viewportHeightPx: number,
  perspectiveDistance: number = 1,
): number {
  return worldUnitsPerPixel(camera, viewportHeightPx, perspectiveDistance) * pixels;
}

/**
 * Screen-space 2D ear layout sizes in world units for the active ortho zoom.
 * Along-edge length is capped so the ear never exceeds
 * {@link BOUNDS_EAR_MAX_SIDE_FRACTION} of the bounds side.
 *
 * @param camera Orthographic (or any) camera.
 * @param viewportHeightPx Drawable pane height in CSS pixels.
 * @param sideLengthWorld Optional full length of the bounds side the ear sits
 *   on.
 * @returns Along-edge, thickness, and offset in world units.
 */
export function computeBoundsEarScreenLayout(
  camera: THREE.Camera,
  viewportHeightPx: number,
  sideLengthWorld?: number,
): { alongEdge: number; thickness: number; offset: number } {
  const upp = worldUnitsPerPixel(camera, viewportHeightPx);
  let alongEdge = upp * BOUNDS_EAR_ALONG_PIXELS;
  if (sideLengthWorld !== undefined && sideLengthWorld > 1e-8) {
    const maxAlong = sideLengthWorld * BOUNDS_EAR_MAX_SIDE_FRACTION;
    alongEdge = Math.min(alongEdge, maxAlong);
  }
  return {
    alongEdge,
    thickness: upp * BOUNDS_EAR_THICKNESS_PIXELS,
    offset: upp * BOUNDS_EAR_OFFSET_PIXELS,
  };
}

/**
 * Exterior-only silhouette resize band in world units from screen pixels.
 *
 * @param camera Active camera (typically orthographic).
 * @param viewportHeightPx Drawable pane height.
 * @returns World-space exterior band thickness.
 */
export function computeSilhouetteExteriorBandWorld(camera: THREE.Camera, viewportHeightPx: number): number {
  return worldSizeFromScreenPixels(camera, BOUNDS_SILHOUETTE_EXTERIOR_PIXELS, viewportHeightPx);
}

/**
 * World-space pick edge length for 3D bounds arrows (easy to grab).
 *
 * @param bounds Current OBB (center used for distance), or null.
 * @param camera Active camera, ideally the perspective pane camera.
 * @returns World-space pick volume edge length.
 */
export function computeBoundsCubeWorldSize(bounds: OrientedBoundsData | null, camera: THREE.Camera | null): number {
  if (camera instanceof THREE.PerspectiveCamera && bounds) {
    return perspectiveCubeWorldSize(camera, bounds.center, computeBoundsCubePickPixels);
  }
  return computeBoundsEarWorldSize(bounds) * 0.55;
}

/**
 * World-space visual length for 3D bounds arrows (may be smaller than the pick
 * volume when far so the view stays uncluttered).
 *
 * @param bounds Current OBB, or null.
 * @param camera Active perspective camera.
 * @returns World-space visual arrow length.
 */
export function computeBoundsCubeVisualWorldSize(
  bounds: OrientedBoundsData | null,
  camera: THREE.Camera | null,
): number {
  if (camera instanceof THREE.PerspectiveCamera && bounds) {
    return perspectiveCubeWorldSize(camera, bounds.center, computeBoundsCubeVisualPixels);
  }
  return computeBoundsCubeWorldSize(bounds, camera) * 0.7;
}

/**
 * Desired on-screen pick size in CSS-ish pixels for a camera distance.
 *
 * @param distance Distance from camera to bounds center.
 * @returns Target pick edge length in pixels.
 */
export function computeBoundsCubePickPixels(distance: number): number {
  return falloffPixels(distance, BOUNDS_CUBE_NEAR_PIXELS, BOUNDS_CUBE_MIN_PIXELS);
}

/**
 * Desired on-screen visual size (smaller footprint than pick).
 *
 * @param distance Distance from camera to bounds center.
 * @returns Target visual edge length in pixels.
 */
export function computeBoundsCubeVisualPixels(distance: number): number {
  return falloffPixels(distance, BOUNDS_CUBE_VISUAL_NEAR_PIXELS, BOUNDS_CUBE_VISUAL_MIN_PIXELS);
}

/** @deprecated Use {@link computeBoundsCubePickPixels}. */
export const computeBoundsCubeTargetPixels = computeBoundsCubePickPixels;

/**
 * Inverse falloff from near pixels toward a minimum as distance grows.
 *
 * @param distance Camera distance.
 * @param nearPixels Size up close.
 * @param minPixels Floor when far.
 * @returns Clamped pixel size.
 */
function falloffPixels(distance: number, nearPixels: number, minPixels: number): number {
  const safeDistance = Math.max(0.05, distance);
  const falloff = BOUNDS_CUBE_NEAR_DISTANCE / Math.max(safeDistance, BOUNDS_CUBE_NEAR_DISTANCE * 0.35);
  return THREE.MathUtils.clamp(nearPixels * falloff, minPixels, nearPixels);
}

/**
 * Converts a pixel-target function into world units at the camera distance.
 *
 * @param camera Perspective camera.
 * @param worldPoint Bounds center.
 * @param pixelsForDistance Maps distance → screen pixels.
 * @returns World-space edge length.
 */
function perspectiveCubeWorldSize(
  camera: THREE.PerspectiveCamera,
  worldPoint: THREE.Vector3,
  pixelsForDistance: (distance: number) => number,
): number {
  const distance = Math.max(0.05, camera.position.distanceTo(worldPoint));
  const targetPixels = pixelsForDistance(distance);
  const verticalFovRadians = THREE.MathUtils.degToRad(camera.fov);
  const worldHeightAtDistance = 2 * distance * Math.tan(verticalFovRadians * 0.5);
  const worldSize = (targetPixels / BOUNDS_CUBE_REFERENCE_VIEWPORT_HEIGHT) * worldHeightAtDistance;
  return THREE.MathUtils.clamp(worldSize, BOUNDS_CUBE_MIN_WORLD_SIZE, BOUNDS_CUBE_MAX_WORLD_SIZE);
}
