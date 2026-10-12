import * as THREE from 'three';
import { pointerEventToNdc } from '@/utils/pointer_ndc.js';

/**
 * Scratch NDC used by projection so callers do not allocate a vector per
 * vertex.
 */
const scratchProjectedPoint = new THREE.Vector3();

/** Screen pixel size of a pick element for component distance tests. */
export interface EditComponentPickElementMetrics {
  width: number;
  height: number;
}

/**
 * Resolves pick-element pixel size from layout bounds (same basis as NDC).
 * Prefer this over clientWidth/clientHeight so CSS-scaled canvases keep pick
 * radii in real CSS pixels.
 *
 * @param pickElement Viewport pick element.
 * @returns Width and height in CSS pixels.
 */
export function resolveEditComponentPickElementMetrics(pickElement: HTMLElement): EditComponentPickElementMetrics {
  const rect = pickElement.getBoundingClientRect();
  const width = Math.max(rect.width, pickElement.clientWidth || 0, 1);
  const height = Math.max(rect.height, pickElement.clientHeight || 0, 1);
  return { width, height };
}

/**
 * Returns the screen-space pixel radius for component picks. Orthographic CAD
 * panes get a slightly larger radius for easier wire hits.
 *
 * @param camera Active camera.
 * @param baseRadius Perspective / default radius in CSS pixels.
 * @returns Effective radius in CSS pixels.
 */
export function resolveEditComponentPickRadius(camera: THREE.Camera, baseRadius: number): number {
  if (camera instanceof THREE.OrthographicCamera) {
    return baseRadius * 1.35;
  }
  return baseRadius;
}

/**
 * Projects a world point to CSS-pixel coordinates within the pick element.
 *
 * @param worldPoint World position.
 * @param camera Camera.
 * @param metrics Pick element size.
 * @param out Optional output vector.
 * @returns Pixel coordinates, or null when outside clip range.
 */
export function projectWorldPointToPickPixels(
  worldPoint: THREE.Vector3,
  camera: THREE.Camera,
  metrics: EditComponentPickElementMetrics,
  out: THREE.Vector2 = new THREE.Vector2(),
): THREE.Vector2 | null {
  const projected = scratchProjectedPoint.copy(worldPoint).project(camera);
  if (projected.z < -1 || projected.z > 1) {
    return null;
  }
  const x = (projected.x + 1) * 0.5 * metrics.width;
  const y = (1 - (projected.y + 1) * 0.5) * metrics.height;
  return out.set(x, y);
}

/**
 * Converts a pointer event into CSS-pixel coordinates for the pick element.
 *
 * @param event Pointer event.
 * @param pickElement Pick element.
 * @param metrics Pick element size.
 * @param out Optional output vector.
 * @returns Pixel coordinates.
 */
export function pointerEventToPickPixels(
  event: MouseEvent,
  pickElement: HTMLElement,
  metrics: EditComponentPickElementMetrics,
  out: THREE.Vector2 = new THREE.Vector2(),
): THREE.Vector2 {
  const ndc = pointerEventToNdc(event, pickElement);
  return out.set((ndc.x + 1) * 0.5 * metrics.width, (1 - (ndc.y + 1) * 0.5) * metrics.height);
}

/**
 * Clamped parameter of the closest point on a 2D segment to a point.
 *
 * @param px Point X.
 * @param py Point Y.
 * @param ax Segment A X.
 * @param ay Segment A Y.
 * @param bx Segment B X.
 * @param by Segment B Y.
 * @returns Parameter t in [0, 1] along A→B.
 */
export function closestParameterOnSegment2d(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const lengthSq = abx * abx + aby * aby;
  if (lengthSq <= 1e-12) {
    return 0;
  }
  const t = ((px - ax) * abx + (py - ay) * aby) / lengthSq;
  return Math.max(0, Math.min(1, t));
}

/**
 * Distance from a 2D point to a segment.
 *
 * @param px Point X.
 * @param py Point Y.
 * @param ax Segment A X.
 * @param ay Segment A Y.
 * @param bx Segment B X.
 * @param by Segment B Y.
 * @returns Distance.
 */
export function distancePointToSegment2d(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const t = closestParameterOnSegment2d(px, py, ax, ay, bx, by);
  const closestX = ax + (bx - ax) * t;
  const closestY = ay + (by - ay) * t;
  return Math.hypot(px - closestX, py - closestY);
}
