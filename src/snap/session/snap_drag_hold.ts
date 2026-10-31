import type * as THREE from 'three';
import { chooseSnapEdgePoint } from '@/snap/candidate/snap_candidate_edge_point.js';
import { createSnapHit, type SnapHit } from '@/snap/hit/snap_hit.js';
import { snapScreenDistanceToPoint } from '@/snap/query/snap_screen_project.js';

/** Pointer and viewport used to decide whether a held target is still in range. */
interface HoldSnapView {
  camera: THREE.Camera;
  pointerPixels: THREE.Vector2;
  viewportWidth: number;
  viewportHeight: number;
  screenRadiusPixels: number;
}

/**
 * Keeps the last snap target when the live query misses and the pointer is
 * still inside the snap radius. A fresh hit replaces the held one.
 *
 * @param fresh Hit from the live query, or null.
 * @param held Hit kept from the previous sample, or null.
 * @param camera Camera.
 * @param pointerPixels Pointer in CSS pixels.
 * @param viewportWidth Viewport width.
 * @param viewportHeight Viewport height.
 * @param screenRadiusPixels Snap radius in CSS pixels.
 * @returns Hit to use for this sample, or null when nothing is in range.
 */
export function holdSnapTarget(
  fresh: SnapHit | null,
  held: SnapHit | null,
  camera: THREE.Camera,
  pointerPixels: THREE.Vector2,
  viewportWidth: number,
  viewportHeight: number,
  screenRadiusPixels: number,
): SnapHit | null {
  if (fresh) {
    return fresh;
  }
  if (!held) {
    return null;
  }
  return retainHeldSnapTarget(
    held,
    holdSnapView(camera, pointerPixels, viewportWidth, viewportHeight, screenRadiusPixels),
  );
}

/**
 * Builds the view used to test a held target.
 *
 * @param camera Camera.
 * @param pointerPixels Pointer in CSS pixels.
 * @param viewportWidth Viewport width.
 * @param viewportHeight Viewport height.
 * @param screenRadiusPixels Snap radius in CSS pixels.
 * @returns View.
 */
function holdSnapView(
  camera: THREE.Camera,
  pointerPixels: THREE.Vector2,
  viewportWidth: number,
  viewportHeight: number,
  screenRadiusPixels: number,
): HoldSnapView {
  return { camera, pointerPixels, viewportWidth, viewportHeight, screenRadiusPixels };
}

/**
 * Returns the held hit when the pointer is still inside its radius.
 *
 * @param held Hit from the previous sample.
 * @param view Pointer and viewport.
 * @returns Updated hit, or null when the pointer has left.
 */
function retainHeldSnapTarget(held: SnapHit, view: HoldSnapView): SnapHit | null {
  const start = held.segmentStart;
  const end = held.segmentEnd;
  if (held.kind === 'edge' && start && end) {
    return retainHeldEdge(held, start, end, view);
  }
  return retainHeldPoint(held, view);
}

/**
 * Slides the held edge to the pointer while the pointer stays in range.
 *
 * @param held Previous edge hit.
 * @param start Edge start.
 * @param end Edge end.
 * @param view Pointer and viewport.
 * @returns Updated edge hit, or null when the edge is out of range.
 */
function retainHeldEdge(held: SnapHit, start: THREE.Vector3, end: THREE.Vector3, view: HoldSnapView): SnapHit | null {
  const choice = chooseSnapEdgePoint(
    start,
    end,
    view.camera,
    view.pointerPixels,
    view.viewportWidth,
    view.viewportHeight,
    view.screenRadiusPixels,
  );
  if (!choice) {
    return null;
  }
  return copyHeldHit(held, choice.point, choice.screenDistancePixels, start, end);
}

/**
 * Keeps a vertex or face while the pointer stays inside the radius of its
 * point.
 *
 * @param held Previous hit.
 * @param view Pointer and viewport.
 * @returns Updated hit, or null when the point is out of range.
 */
function retainHeldPoint(held: SnapHit, view: HoldSnapView): SnapHit | null {
  const distance = snapScreenDistanceToPoint(
    held.point,
    view.camera,
    view.pointerPixels,
    view.viewportWidth,
    view.viewportHeight,
  );
  if (distance === null || distance > view.screenRadiusPixels) {
    return null;
  }
  return copyHeldHit(held, held.point, distance, held.segmentStart, held.segmentEnd);
}

/**
 * Copies a held hit onto a new point and screen distance.
 *
 * @param held Previous hit.
 * @param point World snap location.
 * @param screenDistancePixels Distance from the pointer to that location.
 * @param segmentStart Edge start, or null.
 * @param segmentEnd Edge end, or null.
 * @returns New hit with the same element identity.
 */
function copyHeldHit(
  held: SnapHit,
  point: THREE.Vector3,
  screenDistancePixels: number,
  segmentStart: THREE.Vector3 | null,
  segmentEnd: THREE.Vector3 | null,
): SnapHit {
  return createSnapHit(
    point,
    held.normal,
    held.kind,
    held.transformRootId,
    held.elementId,
    screenDistancePixels,
    segmentStart,
    segmentEnd,
  );
}
