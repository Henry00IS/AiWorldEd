import { Vector3 } from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { ModifierBevelGirder } from './modifier_bevel_uv_girder.js';

/**
 * Picks a girder for every face.
 *
 * @param brush Chamfered local brush.
 * @param girders Local girders.
 * @returns Girder index per face, or -1.
 */
export function modifierBevelAssignGirderFaces(brush: SolidBrush, girders: readonly ModifierBevelGirder[]): number[] {
  const indices: number[] = [];
  for (let face = 0; face < brush.planes.length; face += 1)
    indices.push(modifierBevelPickFaceGirder(brush, girders, face));
  return indices;
}

/**
 * Picks the nearest edge whose direction lies in the face.
 *
 * @param brush Chamfered local brush.
 * @param girders Local girders.
 * @param faceIndex Face index.
 * @returns Girder index, or -1.
 */
function modifierBevelPickFaceGirder(
  brush: SolidBrush,
  girders: readonly ModifierBevelGirder[],
  faceIndex: number,
): number {
  const sample = modifierBevelFaceSample(brush, faceIndex);
  if (!sample || girders.length === 0) return -1;
  const aligned = modifierBevelClosestGirder(girders, sample.centroid, sample.normal, true);
  if (aligned >= 0) return aligned;
  return modifierBevelClosestGirder(girders, sample.centroid, sample.normal, false);
}

/**
 * Returns the face centroid and normal.
 *
 * @param brush Chamfered local brush.
 * @param faceIndex Face index.
 * @returns Sample, or null when the face is empty.
 */
function modifierBevelFaceSample(brush: SolidBrush, faceIndex: number): { centroid: Vector3; normal: Vector3 } | null {
  const normal = brush.planes[faceIndex]?.normal;
  const face = brush.faces[faceIndex];
  const points = face ? brush.getFaceVertices(face) : [];
  if (!normal || points.length === 0) return null;
  return { centroid: modifierBevelAverage(points), normal };
}

/**
 * Averages positions.
 *
 * @param points Positions.
 * @returns Centroid.
 */
function modifierBevelAverage(points: readonly Vector3[]): Vector3 {
  const sum = new Vector3();
  for (const point of points) sum.add(point);
  return sum.multiplyScalar(1 / points.length);
}

/**
 * Returns the girder closest to a point.
 *
 * @param girders Local girders.
 * @param point Local point.
 * @param normal Face normal.
 * @param requireInFace True when a direction almost equal to the normal is
 *   skipped.
 * @returns Girder index, or -1.
 */
function modifierBevelClosestGirder(
  girders: readonly ModifierBevelGirder[],
  point: Vector3,
  normal: Vector3,
  requireInFace: boolean,
): number {
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < girders.length; index += 1) {
    const chosen = modifierBevelConsiderGirder(girders[index], index, point, normal, requireInFace, best, bestDistance);
    best = chosen.index;
    bestDistance = chosen.distance;
  }
  return best;
}

/**
 * Keeps a girder when it is closer and allowed for the face.
 *
 * @param girder Candidate girder.
 * @param index Candidate index.
 * @param point Local point.
 * @param normal Face normal.
 * @param requireInFace True when a direction almost equal to the normal is
 *   skipped.
 * @param bestIndex Index of the current winner.
 * @param bestDistance Distance of the current winner.
 * @returns Updated winner.
 */
function modifierBevelConsiderGirder(
  girder: ModifierBevelGirder | undefined,
  index: number,
  point: Vector3,
  normal: Vector3,
  requireInFace: boolean,
  bestIndex: number,
  bestDistance: number,
): { index: number; distance: number } {
  if (!girder || modifierBevelGirderSkipped(girder, normal, requireInFace))
    return { index: bestIndex, distance: bestDistance };
  const distance = modifierBevelSegmentDistance(point, girder.start, girder.end);
  if (distance >= bestDistance) return { index: bestIndex, distance: bestDistance };
  return { index, distance };
}

/**
 * Returns whether a girder direction is too close to the face normal.
 *
 * @param girder Candidate girder.
 * @param normal Face normal.
 * @param requireInFace True when that direction is skipped.
 * @returns True when the girder is skipped.
 */
function modifierBevelGirderSkipped(girder: ModifierBevelGirder, normal: Vector3, requireInFace: boolean): boolean {
  return requireInFace && Math.abs(normal.dot(girder.direction)) > 0.9;
}

/**
 * Returns the distance from a point to a segment.
 *
 * @param point Local point.
 * @param start Segment start.
 * @param end Segment end.
 * @returns Distance.
 */
function modifierBevelSegmentDistance(point: Vector3, start: Vector3, end: Vector3): number {
  const edge = end.clone().sub(start);
  const lengthSq = edge.lengthSq();
  if (lengthSq < 1e-12) return point.distanceTo(start);
  const t = Math.min(1, Math.max(0, point.clone().sub(start).dot(edge) / lengthSq));
  return point.distanceTo(start.clone().addScaledVector(edge, t));
}
