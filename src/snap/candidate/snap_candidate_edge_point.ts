import * as THREE from 'three';
import { SNAP_EDGE_MAGNET_SCALE } from '@/snap/policy/snap_policy.js';
import { snapProjectWorldToPixels, snapScreenDistanceToPoint } from '@/snap/query/snap_screen_project.js';

/** Chosen point on an edge and its screen distance. */
export interface SnapEdgePointChoice {
  point: THREE.Vector3;
  screenDistancePixels: number;
}

const scratchStartPixels = new THREE.Vector2();
const scratchEndPixels = new THREE.Vector2();

/**
 * Picks the edge point the pointer should snap to. Endpoints and the midpoint
 * win when the pointer is inside the magnet radius. Otherwise the point on the
 * segment closest to the pointer in screen space is used.
 *
 * @param segmentStart Edge start in world space.
 * @param segmentEnd Edge end in world space.
 * @param camera Camera.
 * @param pointerPixels Pointer in CSS pixels.
 * @param viewportWidth Viewport width.
 * @param viewportHeight Viewport height.
 * @param screenRadiusPixels Full edge snap radius.
 * @returns Chosen point, or null when the segment is outside the radius.
 */
export function chooseSnapEdgePoint(
  segmentStart: THREE.Vector3,
  segmentEnd: THREE.Vector3,
  camera: THREE.Camera,
  pointerPixels: THREE.Vector2,
  viewportWidth: number,
  viewportHeight: number,
  screenRadiusPixels: number,
): SnapEdgePointChoice | null {
  const magnetRadius = screenRadiusPixels * SNAP_EDGE_MAGNET_SCALE;
  const magnet = chooseMagnetPoint(
    segmentStart,
    segmentEnd,
    camera,
    pointerPixels,
    viewportWidth,
    viewportHeight,
    magnetRadius,
  );
  if (magnet) {
    return magnet;
  }
  return chooseScreenClosestPoint(
    segmentStart,
    segmentEnd,
    camera,
    pointerPixels,
    viewportWidth,
    viewportHeight,
    screenRadiusPixels,
  );
}

/**
 * Returns an endpoint or midpoint inside the magnet radius.
 *
 * @param segmentStart Edge start.
 * @param segmentEnd Edge end.
 * @param camera Camera.
 * @param pointerPixels Pointer.
 * @param viewportWidth Viewport width.
 * @param viewportHeight Viewport height.
 * @param magnetPixels Magnet radius.
 * @returns Magnet point, or null.
 */
function chooseMagnetPoint(
  segmentStart: THREE.Vector3,
  segmentEnd: THREE.Vector3,
  camera: THREE.Camera,
  pointerPixels: THREE.Vector2,
  viewportWidth: number,
  viewportHeight: number,
  magnetPixels: number,
): SnapEdgePointChoice | null {
  const midpoint = segmentStart.clone().lerp(segmentEnd, 0.5);
  const points = [segmentStart, segmentEnd, midpoint];
  return closestScreenPoint(points, camera, pointerPixels, viewportWidth, viewportHeight, magnetPixels);
}

/**
 * Returns the screen-space closest point on the segment inside the radius.
 *
 * @param segmentStart Edge start.
 * @param segmentEnd Edge end.
 * @param camera Camera.
 * @param pointerPixels Pointer.
 * @param viewportWidth Viewport width.
 * @param viewportHeight Viewport height.
 * @param screenRadiusPixels Full radius.
 * @returns Closest point, or null.
 */
function chooseScreenClosestPoint(
  segmentStart: THREE.Vector3,
  segmentEnd: THREE.Vector3,
  camera: THREE.Camera,
  pointerPixels: THREE.Vector2,
  viewportWidth: number,
  viewportHeight: number,
  screenRadiusPixels: number,
): SnapEdgePointChoice | null {
  const startPixels = snapProjectWorldToPixels(segmentStart, camera, viewportWidth, viewportHeight, scratchStartPixels);
  const endPixels = snapProjectWorldToPixels(segmentEnd, camera, viewportWidth, viewportHeight, scratchEndPixels);
  if (!startPixels || !endPixels) {
    return null;
  }
  const distance = screenSegmentDistance(startPixels, endPixels, pointerPixels);
  if (distance > screenRadiusPixels) {
    return null;
  }
  const parameter = screenSegmentParameter(startPixels, endPixels.clone(), pointerPixels);
  return { point: segmentStart.clone().lerp(segmentEnd, parameter), screenDistancePixels: distance };
}

/**
 * Parameter of the closest point on a 2D segment.
 *
 * @param startPixels Segment start in pixels.
 * @param endPixels Segment end in pixels.
 * @param pointerPixels Pointer.
 * @returns Clamped parameter from 0 to 1.
 */
function screenSegmentParameter(
  startPixels: THREE.Vector2,
  endPixels: THREE.Vector2,
  pointerPixels: THREE.Vector2,
): number {
  const span = endPixels.sub(startPixels);
  const lengthSquared = span.lengthSq();
  if (lengthSquared <= 1e-8) {
    return 0;
  }
  const unclamped = pointerPixels.clone().sub(startPixels).dot(span) / lengthSquared;
  return THREE.MathUtils.clamp(unclamped, 0, 1);
}

/**
 * Pixel distance from the pointer to a 2D segment.
 *
 * @param startPixels Segment start. Not mutated.
 * @param endPixels Segment end. Not mutated.
 * @param pointerPixels Pointer.
 * @returns Distance in pixels.
 */
function screenSegmentDistance(
  startPixels: THREE.Vector2,
  endPixels: THREE.Vector2,
  pointerPixels: THREE.Vector2,
): number {
  const parameter = screenSegmentParameter(startPixels, endPixels.clone(), pointerPixels);
  const closest = startPixels.clone().lerp(endPixels, parameter);
  return closest.distanceTo(pointerPixels);
}

/**
 * Returns the candidate closest to the pointer inside a radius.
 *
 * @param points Candidate world points.
 * @param camera Camera.
 * @param pointerPixels Pointer.
 * @param viewportWidth Viewport width.
 * @param viewportHeight Viewport height.
 * @param radiusPixels Maximum screen distance.
 * @returns Closest point, or null.
 */
function closestScreenPoint(
  points: readonly THREE.Vector3[],
  camera: THREE.Camera,
  pointerPixels: THREE.Vector2,
  viewportWidth: number,
  viewportHeight: number,
  radiusPixels: number,
): SnapEdgePointChoice | null {
  let best: SnapEdgePointChoice | null = null;
  for (const point of points) {
    best = keepCloserPoint(best, point, camera, pointerPixels, viewportWidth, viewportHeight, radiusPixels);
  }
  return best;
}

/**
 * Keeps the closer of the current best and a candidate inside the radius.
 *
 * @param best Current best, or null.
 * @param point Candidate world point.
 * @param camera Camera.
 * @param pointerPixels Pointer.
 * @param viewportWidth Viewport width.
 * @param viewportHeight Viewport height.
 * @param radiusPixels Maximum screen distance.
 * @returns Updated best.
 */
function keepCloserPoint(
  best: SnapEdgePointChoice | null,
  point: THREE.Vector3,
  camera: THREE.Camera,
  pointerPixels: THREE.Vector2,
  viewportWidth: number,
  viewportHeight: number,
  radiusPixels: number,
): SnapEdgePointChoice | null {
  const distance = snapScreenDistanceToPoint(point, camera, pointerPixels, viewportWidth, viewportHeight);
  if (distance === null || distance > radiusPixels) {
    return best;
  }
  if (!best || distance < best.screenDistancePixels) {
    return { point: point.clone(), screenDistancePixels: distance };
  }
  return best;
}
