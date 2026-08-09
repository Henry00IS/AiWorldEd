import * as THREE from 'three';
import type { DataOrientedBounds } from './builder_oriented_bounds.js';

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

/**
 * Soft floor for perspective arrow world edge length when the OBB is large
 * enough on screen that a constant-pixel grip is still safe. Never applied
 * above the bounds-relative cap (see {@link BOUNDS_CUBE_MAX_EDGE_FRACTION}).
 */
export const BOUNDS_CUBE_MIN_WORLD_SIZE = 0.04;

/** Hard ceiling on pick world edge length when flying extremely far. */
export const BOUNDS_CUBE_MAX_WORLD_SIZE = 1.6;

/**
 * Maximum fraction of the thinnest OBB full edge that a 3D arrow pick cube may
 * cover. Caps constant-pixel padding when the selection is small on screen so
 * face-body drag stays reachable. World-edge fraction equals screen-edge
 * fraction under perspective projection.
 */
export const BOUNDS_CUBE_MAX_EDGE_FRACTION = 0.32;

/** Absolute floor so a zero-thickness OBB cannot produce a zero pick size. */
const BOUNDS_CUBE_ABSOLUTE_MIN_WORLD_SIZE = 1e-6;

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
export function computeBoundsEarWorldSize(bounds: DataOrientedBounds | null): number {
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
 * World-space pick edge length for 3D bounds arrows (easy to grab when the OBB
 * is large on screen; tightened when it is not).
 *
 * @param bounds Current OBB (center used for distance), or null.
 * @param camera Active camera, ideally the perspective pane camera.
 * @returns World-space pick volume edge length.
 */
export function computeBoundsCubeWorldSize(bounds: DataOrientedBounds | null, camera: THREE.Camera | null): number {
  if (camera instanceof THREE.PerspectiveCamera && bounds) {
    return perspectiveArrowPickWorldSize(camera, bounds);
  }
  return clampArrowWorldSizeToBounds(computeBoundsEarWorldSize(bounds) * 0.55, bounds);
}

/**
 * World-space visual length for 3D bounds arrows. Never larger than the pick
 * volume so padding shrinks to pixel-precise when the OBB is small on screen.
 *
 * @param bounds Current OBB, or null.
 * @param camera Active perspective camera.
 * @returns World-space visual arrow length.
 */
export function computeBoundsCubeVisualWorldSize(
  bounds: DataOrientedBounds | null,
  camera: THREE.Camera | null,
): number {
  const pickSize = computeBoundsCubeWorldSize(bounds, camera);
  if (camera instanceof THREE.PerspectiveCamera && bounds) {
    const visualUncapped = perspectiveArrowUncappedWorldSize(camera, bounds.center, computeBoundsCubeVisualPixels);
    return Math.min(visualUncapped, pickSize);
  }
  return Math.min(pickSize * 0.7, pickSize);
}

/**
 * Maximum 3D arrow pick/visual edge length allowed for an OBB so grips cannot
 * blanket the thinnest face (and thus the whole surface when the selection is
 * small on screen).
 *
 * @param bounds Oriented bounds, or null.
 * @returns World-space maximum edge length.
 */
export function computeBoundsCubeMaxWorldSizeFromBounds(bounds: DataOrientedBounds | null): number {
  if (!bounds) {
    return BOUNDS_CUBE_MAX_WORLD_SIZE;
  }
  const minHalf = Math.min(bounds.halfExtents.x, bounds.halfExtents.y, bounds.halfExtents.z);
  const minFullEdge = Math.max(0, minHalf * 2);
  return minFullEdge * BOUNDS_CUBE_MAX_EDGE_FRACTION;
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
 * Perspective 3D arrow pick size: constant-pixel target with soft floors, then
 * clamped so it cannot cover more than {@link BOUNDS_CUBE_MAX_EDGE_FRACTION} of
 * the thinnest OBB edge.
 *
 * @param camera Perspective camera.
 * @param bounds Oriented bounds for distance and edge cap.
 * @returns World-space pick edge length.
 */
function perspectiveArrowPickWorldSize(camera: THREE.PerspectiveCamera, bounds: DataOrientedBounds): number {
  const uncapped = perspectiveArrowUncappedWorldSize(camera, bounds.center, computeBoundsCubePickPixels);
  return clampArrowWorldSizeToBounds(uncapped, bounds);
}

/**
 * Converts a pixel-target function into world units at the camera distance
 * without the bounds-edge cap (still hard-clamped to global min/max).
 *
 * @param camera Perspective camera.
 * @param worldPoint Bounds center.
 * @param pixelsForDistance Maps distance → screen pixels.
 * @returns World-space edge length before bounds-relative clamping.
 */
function perspectiveArrowUncappedWorldSize(
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

/**
 * Applies the bounds-edge and absolute ceilings to an arrow world size. The
 * soft global min is only kept when the OBB is large enough to allow it.
 *
 * @param worldSize Candidate world edge length.
 * @param bounds Oriented bounds, or null.
 * @returns Clamped world edge length.
 */
function clampArrowWorldSizeToBounds(worldSize: number, bounds: DataOrientedBounds | null): number {
  const maxFromBounds = computeBoundsCubeMaxWorldSizeFromBounds(bounds);
  const maxAllowed = Math.min(BOUNDS_CUBE_MAX_WORLD_SIZE, maxFromBounds);
  const minAllowed = Math.min(BOUNDS_CUBE_MIN_WORLD_SIZE, maxAllowed);
  const clamped = THREE.MathUtils.clamp(worldSize, minAllowed, maxAllowed);
  return Math.max(BOUNDS_CUBE_ABSOLUTE_MIN_WORLD_SIZE, clamped);
}
