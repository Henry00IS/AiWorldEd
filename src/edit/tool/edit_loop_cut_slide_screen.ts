import * as THREE from 'three';
import {
  pointerEventToPickPixels,
  projectWorldPointToPickPixels,
  resolveEditComponentPickElementMetrics,
} from '@/edit/pick/edit_component_screen_metrics.js';
import { projectLoopCutParameterFromPointerRay } from './edit_loop_cut_slide_ray.js';

/** Ignore end-on edges whose screen image is shorter than this many pixels. */
const LOOP_CUT_MIN_SCREEN_EDGE_PIXELS = 4;

/**
 * Projects the pointer onto a locked edge by first snapping to that edge's
 * screen line, then solving the camera ray against the 3D segment.
 *
 * @param event Pointer event.
 * @param camera Active camera.
 * @param pickElement Pick element.
 * @param worldA Edge start.
 * @param worldB Edge end.
 * @returns Interior parameter, or null when the edge cannot be projected.
 */
export function projectLoopCutParameterAlongScreenEdge(
  event: MouseEvent,
  camera: THREE.Camera,
  pickElement: HTMLElement,
  worldA: THREE.Vector3,
  worldB: THREE.Vector3,
): number | null {
  const screenPoint = projectPointerOntoEdgeScreenLine(event, camera, pickElement, worldA, worldB);
  if (!screenPoint) {
    return projectLoopCutParameterFromPointerRay(event, camera, pickElement, worldA, worldB);
  }
  return projectLoopCutParameterFromPointerRay(
    createPointerEventAtPickPixels(pickElement, screenPoint.x, screenPoint.y),
    camera,
    pickElement,
    worldA,
    worldB,
  );
}

/**
 * Finds the pointer's closest point on the screen-space line of a world edge.
 *
 * @param event Pointer event.
 * @param camera Active camera.
 * @param pickElement Pick element.
 * @param worldA Edge start.
 * @param worldB Edge end.
 * @returns Screen point on the edge line, or null when the edge is end-on.
 */
export function projectPointerOntoEdgeScreenLine(
  event: MouseEvent,
  camera: THREE.Camera,
  pickElement: HTMLElement,
  worldA: THREE.Vector3,
  worldB: THREE.Vector3,
): THREE.Vector2 | null {
  camera.updateMatrixWorld(true);
  const metrics = resolveEditComponentPickElementMetrics(pickElement);
  const screenA = projectWorldPointToPickPixels(worldA, camera, metrics);
  const screenB = projectWorldPointToPickPixels(worldB, camera, metrics);
  if (!screenA || !screenB || screenA.distanceToSquared(screenB) < LOOP_CUT_MIN_SCREEN_EDGE_PIXELS ** 2) {
    return null;
  }
  const pointer = pointerEventToPickPixels(event, pickElement, metrics);
  return closestPointOnPaddedScreenSegment(pointer.x, pointer.y, screenA.x, screenA.y, screenB.x, screenB.y);
}

/**
 * Closest point on a 2D segment padded past both ends.
 *
 * @param px Pointer X.
 * @param py Pointer Y.
 * @param ax Segment A X.
 * @param ay Segment A Y.
 * @param bx Segment B X.
 * @param by Segment B Y.
 * @returns Closest padded screen point.
 */
function closestPointOnPaddedScreenSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): THREE.Vector2 {
  const spanX = bx - ax;
  const spanY = by - ay;
  const lengthSq = spanX * spanX + spanY * spanY;
  const rawT = lengthSq <= 1e-12 ? 0 : ((px - ax) * spanX + (py - ay) * spanY) / lengthSq;
  const paddedT = Math.max(-0.25, Math.min(1.25, rawT));
  return new THREE.Vector2(ax + spanX * paddedT, ay + spanY * paddedT);
}

/**
 * Builds a pointer event at pick-pixel coordinates.
 *
 * @param pickElement Pick element.
 * @param pixelX Pick-pixel X.
 * @param pixelY Pick-pixel Y.
 * @returns Pointer event.
 */
function createPointerEventAtPickPixels(pickElement: HTMLElement, pixelX: number, pixelY: number): MouseEvent {
  const rect = pickElement.getBoundingClientRect();
  return {
    clientX: rect.left + pixelX,
    clientY: rect.top + pixelY,
    preventDefault: () => {},
    stopPropagation: () => {},
  } as MouseEvent;
}
