import * as THREE from 'three';
import type { SnapHitKind } from './snap_hit_kind.js';

/** One winning or candidate geometry snap location in world space. */
export interface SnapHit {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  kind: SnapHitKind;
  transformRootId: string;
  elementId: string;
  screenDistancePixels: number;
  segmentStart: THREE.Vector3 | null;
  segmentEnd: THREE.Vector3 | null;
}

/**
 * Builds a snap hit. Edge hits keep both segment endpoints. Other kinds pass
 * null endpoints.
 *
 * @param point World snap location.
 * @param normal Face normal, edge direction, or a zero vector for a vertex.
 * @param kind Element kind.
 * @param transformRootId Transform root that owns the element.
 * @param elementId Stable id of the element inside that root.
 * @param screenDistancePixels Distance from the pointer to the snap point.
 * @param segmentStart First endpoint when the hit is an edge.
 * @param segmentEnd Second endpoint when the hit is an edge.
 * @returns Snap hit value.
 */
export function createSnapHit(
  point: THREE.Vector3,
  normal: THREE.Vector3,
  kind: SnapHitKind,
  transformRootId: string,
  elementId: string,
  screenDistancePixels: number,
  segmentStart: THREE.Vector3 | null,
  segmentEnd: THREE.Vector3 | null,
): SnapHit {
  return {
    point: point.clone(),
    normal: normal.clone(),
    kind,
    transformRootId,
    elementId,
    screenDistancePixels,
    segmentStart: cloneSnapHitPoint(segmentStart),
    segmentEnd: cloneSnapHitPoint(segmentEnd),
  };
}

/**
 * Clones an optional endpoint.
 *
 * @param point Endpoint or null.
 * @returns Clone, or null.
 */
function cloneSnapHitPoint(point: THREE.Vector3 | null): THREE.Vector3 | null {
  if (!point) {
    return null;
  }
  return point.clone();
}
