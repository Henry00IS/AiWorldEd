import * as THREE from 'three';
import { BoundsFace } from '@/types/bounds_face.js';
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
 * Maximum fraction of a face's reference edge (geometric mean of its two span
 * edges) that a 3D arrow pick cube may cover. Square faces behave like a
 * shorter-edge cap; long thin faces (e.g. 0.03125 × wide) stay grabable.
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
 * World-space pick edge length for 3D bounds arrows when no face is specified.
 * Uses the most generous face cap so large faces of thin brushes stay usable;
 * prefer {@link computeBoundsCubeWorldSizeForFace} for real grips.
 *
 * @param bounds Current OBB (center used for distance), or null.
 * @param camera Active camera, ideally the perspective pane camera.
 * @returns World-space pick volume edge length.
 */
export function computeBoundsCubeWorldSize(bounds: DataOrientedBounds | null, camera: THREE.Camera | null): number {
  if (camera instanceof THREE.PerspectiveCamera && bounds) {
    const uncapped = perspectiveArrowUncappedWorldSize(camera, bounds.center, computeBoundsCubePickPixels);
    return clampArrowWorldSizeToMax(uncapped, computeBoundsCubeMaxWorldSizeFromBounds(bounds));
  }
  return clampArrowWorldSizeToMax(
    computeBoundsEarWorldSize(bounds) * 0.55,
    computeBoundsCubeMaxWorldSizeFromBounds(bounds),
  );
}

/**
 * World-space pick edge length for one 3D face arrow. Cap uses that face's
 * shorter edge only (not brush thickness along the normal).
 *
 * @param bounds Current OBB, or null.
 * @param camera Active camera, ideally the perspective pane camera.
 * @param face Face owning the arrow.
 * @returns World-space pick volume edge length.
 */
export function computeBoundsCubeWorldSizeForFace(
  bounds: DataOrientedBounds | null,
  camera: THREE.Camera | null,
  face: BoundsFace,
): number {
  if (camera instanceof THREE.PerspectiveCamera && bounds) {
    const uncapped = perspectiveArrowUncappedWorldSize(camera, bounds.center, computeBoundsCubePickPixels);
    return clampArrowWorldSizeToMax(uncapped, computeBoundsCubeMaxWorldSizeForFace(bounds, face));
  }
  return clampArrowWorldSizeToMax(
    computeBoundsEarWorldSize(bounds) * 0.55,
    computeBoundsCubeMaxWorldSizeForFace(bounds, face),
  );
}

/**
 * World-space visual length for 3D bounds arrows when no face is specified.
 * Never larger than the pick volume.
 *
 * @param bounds Current OBB, or null.
 * @param camera Active perspective camera.
 * @returns World-space visual arrow length.
 */
export function computeBoundsCubeVisualWorldSize(
  bounds: DataOrientedBounds | null,
  camera: THREE.Camera | null,
): number {
  return computeVisualArrowWorldSize(bounds, camera, computeBoundsCubeWorldSize(bounds, camera));
}

/**
 * World-space visual length for one 3D face arrow. Never larger than that
 * face's pick volume.
 *
 * @param bounds Current OBB, or null.
 * @param camera Active perspective camera.
 * @param face Face owning the arrow.
 * @returns World-space visual arrow length.
 */
export function computeBoundsCubeVisualWorldSizeForFace(
  bounds: DataOrientedBounds | null,
  camera: THREE.Camera | null,
  face: BoundsFace,
): number {
  return computeVisualArrowWorldSize(bounds, camera, computeBoundsCubeWorldSizeForFace(bounds, camera, face));
}

/**
 * Most generous per-face pick cap on an OBB. Used when a single size must stand
 * in for all faces.
 *
 * @param bounds Oriented bounds, or null.
 * @returns World-space maximum edge length.
 */
export function computeBoundsCubeMaxWorldSizeFromBounds(bounds: DataOrientedBounds | null): number {
  if (!bounds) {
    return BOUNDS_CUBE_MAX_WORLD_SIZE;
  }
  const maxFaceCap = Math.max(
    computeBoundsCubeMaxWorldSizeForFace(bounds, BoundsFace.POS_X),
    computeBoundsCubeMaxWorldSizeForFace(bounds, BoundsFace.POS_Y),
    computeBoundsCubeMaxWorldSizeForFace(bounds, BoundsFace.POS_Z),
  );
  return Math.max(BOUNDS_CUBE_ABSOLUTE_MIN_WORLD_SIZE, maxFaceCap);
}

/**
 * Maximum 3D arrow pick/visual edge length for one face so the grip cannot
 * blanket that face when it is small on screen, while long thin faces keep a
 * usable grip from their longer span.
 *
 * @param bounds Oriented bounds, or null.
 * @param face Face owning the arrow.
 * @returns World-space maximum edge length for that face.
 */
export function computeBoundsCubeMaxWorldSizeForFace(bounds: DataOrientedBounds | null, face: BoundsFace): number {
  if (!bounds) {
    return BOUNDS_CUBE_MAX_WORLD_SIZE;
  }
  return computeBoundsFaceReferenceEdge(bounds, face) * BOUNDS_CUBE_MAX_EDGE_FRACTION;
}

/**
 * Reference length for sizing a face arrow: geometric mean of the two full
 * edges that span the face (not the face-normal thickness of the solid). Equal
 * edges match the shorter-edge rule; elongated faces (thin × wide) stay
 * pickable.
 *
 * @param bounds Oriented bounds.
 * @param face Face to measure.
 * @returns World-space reference edge length.
 */
export function computeBoundsFaceReferenceEdge(bounds: DataOrientedBounds, face: BoundsFace): number {
  const edges = computeBoundsFaceFullEdges(bounds, face);
  return Math.sqrt(Math.max(0, edges.shorter) * Math.max(0, edges.longer));
}

/**
 * Shorter full edge length of a bounds face (the two axes spanning the face).
 *
 * @param bounds Oriented bounds.
 * @param face Face to measure.
 * @returns Full length of the shorter face edge in world units.
 */
export function computeBoundsFaceMinFullEdge(bounds: DataOrientedBounds, face: BoundsFace): number {
  return computeBoundsFaceFullEdges(bounds, face).shorter;
}

/**
 * Both full edge lengths of a bounds face in local OBB axes.
 *
 * @param bounds Oriented bounds.
 * @param face Face to measure.
 * @returns Shorter and longer full edge lengths.
 */
export function computeBoundsFaceFullEdges(
  bounds: DataOrientedBounds,
  face: BoundsFace,
): { shorter: number; longer: number } {
  const half = bounds.halfExtents;
  const edgeA = resolveBoundsFaceSpanHalfA(half, face) * 2;
  const edgeB = resolveBoundsFaceSpanHalfB(half, face) * 2;
  return {
    shorter: Math.min(edgeA, edgeB),
    longer: Math.max(edgeA, edgeB),
  };
}

/**
 * First spanning half-extent of a face (U axis of the face rectangle).
 *
 * @param halfExtents OBB half extents.
 * @param face Face to measure.
 * @returns Half length along the first face-span axis.
 */
function resolveBoundsFaceSpanHalfA(halfExtents: THREE.Vector3, face: BoundsFace): number {
  if (face === BoundsFace.POS_X || face === BoundsFace.NEG_X) {
    return halfExtents.y;
  }
  if (face === BoundsFace.POS_Y || face === BoundsFace.NEG_Y) {
    return halfExtents.x;
  }
  return halfExtents.x;
}

/**
 * Second spanning half-extent of a face (V axis of the face rectangle).
 *
 * @param halfExtents OBB half extents.
 * @param face Face to measure.
 * @returns Half length along the second face-span axis.
 */
function resolveBoundsFaceSpanHalfB(halfExtents: THREE.Vector3, face: BoundsFace): number {
  if (face === BoundsFace.POS_X || face === BoundsFace.NEG_X) {
    return halfExtents.z;
  }
  if (face === BoundsFace.POS_Y || face === BoundsFace.NEG_Y) {
    return halfExtents.z;
  }
  return halfExtents.y;
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
 * Visual arrow size from an already-resolved pick size.
 *
 * @param bounds Current OBB, or null.
 * @param camera Active camera.
 * @param pickSize Pick edge length that visual must not exceed.
 * @returns World-space visual edge length.
 */
function computeVisualArrowWorldSize(
  bounds: DataOrientedBounds | null,
  camera: THREE.Camera | null,
  pickSize: number,
): number {
  if (camera instanceof THREE.PerspectiveCamera && bounds) {
    const visualUncapped = perspectiveArrowUncappedWorldSize(camera, bounds.center, computeBoundsCubeVisualPixels);
    return Math.min(visualUncapped, pickSize);
  }
  return Math.min(pickSize * 0.7, pickSize);
}

/**
 * Converts a pixel-target function into world units at the camera distance
 * without a face-edge cap (still hard-clamped to global min/max).
 *
 * @param camera Perspective camera.
 * @param worldPoint Bounds center.
 * @param pixelsForDistance Maps distance → screen pixels.
 * @returns World-space edge length before face-relative clamping.
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
 * Applies a face or bounds ceiling and the soft global min when that ceiling
 * still allows it.
 *
 * @param worldSize Candidate world edge length.
 * @param maxFromFaceOrBounds Face- or bounds-relative maximum.
 * @returns Clamped world edge length.
 */
function clampArrowWorldSizeToMax(worldSize: number, maxFromFaceOrBounds: number): number {
  const maxAllowed = Math.min(BOUNDS_CUBE_MAX_WORLD_SIZE, maxFromFaceOrBounds);
  const minAllowed = Math.min(BOUNDS_CUBE_MIN_WORLD_SIZE, maxAllowed);
  const clamped = THREE.MathUtils.clamp(worldSize, minAllowed, maxAllowed);
  return Math.max(BOUNDS_CUBE_ABSOLUTE_MIN_WORLD_SIZE, clamped);
}
