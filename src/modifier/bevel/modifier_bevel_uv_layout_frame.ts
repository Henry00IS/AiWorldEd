import { Vector3 } from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { ModifierBevelFaceRecord } from './modifier_bevel_face_record.js';

/** Edge-aligned coordinates for one generated face. */
export interface ModifierBevelLayoutFrame {
  /** Point where U and the unscaled V are zero. */
  origin: Vector3;
  /** Unit direction along the bevel. */
  along: Vector3;
  /** Unit direction across the bevel, into the face. */
  across: Vector3;
  /** Lowest along-coordinate of the face. */
  minAlong: number;
  /** Lowest across-coordinate of the face. */
  minAcross: number;
  /** Along extent of the face. */
  alongSpan: number;
  /** Across extent of the face. */
  acrossSpan: number;
}

/**
 * Builds edge-aligned coordinates for one generated face.
 *
 * @param brush Derived brush.
 * @param faceIndex Face index.
 * @param record Inherit record for that face.
 * @returns Frame, or null when the face has no measurable edge.
 */
export function modifierBevelLayoutFrame(
  brush: SolidBrush,
  faceIndex: number,
  record: ModifierBevelFaceRecord | undefined,
): ModifierBevelLayoutFrame | null {
  const edge = modifierBevelLayoutEdge(brush, faceIndex, record);
  const normal = brush.planes[faceIndex]?.normal;
  if (!edge || !normal) return null;
  return modifierBevelFrameFromEdge(brush, faceIndex, edge.pointA, edge.pointB, normal);
}

/**
 * Picks the recorded bevel edge, or the longest face edge.
 *
 * @param brush Derived brush.
 * @param faceIndex Face index.
 * @param record Inherit record.
 * @returns Endpoints, or null.
 */
function modifierBevelLayoutEdge(
  brush: SolidBrush,
  faceIndex: number,
  record: ModifierBevelFaceRecord | undefined,
): { pointA: Vector3; pointB: Vector3 } | null {
  if (record?.chamferEdge) return { pointA: record.chamferEdge.pointA, pointB: record.chamferEdge.pointB };
  return modifierBevelLongestFaceEdge(brush, faceIndex);
}

/**
 * Returns the longest wing edge of one face.
 *
 * @param brush Derived brush.
 * @param faceIndex Face index.
 * @returns Endpoints, or null.
 */
function modifierBevelLongestFaceEdge(
  brush: SolidBrush,
  faceIndex: number,
): { pointA: Vector3; pointB: Vector3 } | null {
  const face = brush.faces[faceIndex];
  if (!face) return null;
  let best: { pointA: Vector3; pointB: Vector3 } | null = null;
  let bestLength = 0;
  const last = face.firstEdge + face.edgeCount;
  for (let edgeIndex = face.firstEdge; edgeIndex < last; edgeIndex += 1) {
    const edge = modifierBevelWingEdge(brush, edgeIndex);
    if (!edge || edge.pointA.distanceTo(edge.pointB) <= bestLength) continue;
    best = edge;
    bestLength = edge.pointA.distanceTo(edge.pointB);
  }
  return best;
}

/**
 * Reads one wing edge.
 *
 * @param brush Derived brush.
 * @param edgeIndex Wing edge index.
 * @returns Endpoints, or null.
 */
function modifierBevelWingEdge(brush: SolidBrush, edgeIndex: number): { pointA: Vector3; pointB: Vector3 } | null {
  const edge = brush.wingEdges[edgeIndex];
  const twin = edge ? brush.wingEdges[edge.twinIndex] : undefined;
  const pointA = twin ? brush.vertices[twin.vertexIndex] : undefined;
  const pointB = edge ? brush.vertices[edge.vertexIndex] : undefined;
  if (!pointA || !pointB) return null;
  return { pointA, pointB };
}

/**
 * Measures a face against one directed edge.
 *
 * @param brush Derived brush.
 * @param faceIndex Face index.
 * @param pointA First edge point.
 * @param pointB Second edge point.
 * @param normal Face normal.
 * @returns Frame, or null when the edge is degenerate.
 */
function modifierBevelFrameFromEdge(
  brush: SolidBrush,
  faceIndex: number,
  pointA: Vector3,
  pointB: Vector3,
  normal: Vector3,
): ModifierBevelLayoutFrame | null {
  const directed = modifierBevelDirectedEdge(pointA, pointB);
  if (!directed) return null;
  const across = modifierBevelAcrossDirection(brush, faceIndex, directed.origin, directed.along, normal);
  if (!across) return null;
  return modifierBevelMeasureFrame(brush, faceIndex, directed.origin, directed.along, across);
}

/**
 * Points the edge from the lexicographically earlier endpoint.
 *
 * @param pointA First endpoint.
 * @param pointB Second endpoint.
 * @returns Origin and unit direction, or null when the points coincide.
 */
function modifierBevelDirectedEdge(pointA: Vector3, pointB: Vector3): { origin: Vector3; along: Vector3 } | null {
  const forward = modifierBevelEarlierPoint(pointA, pointB);
  const origin = forward ? pointA : pointB;
  const along = (forward ? pointB : pointA).clone().sub(origin);
  if (along.lengthSq() <= 1e-16) return null;
  return { origin, along: along.normalize() };
}

/**
 * Returns whether the first point sorts before the second.
 *
 * @param left First point.
 * @param right Second point.
 * @returns True when left comes first.
 */
function modifierBevelEarlierPoint(left: Vector3, right: Vector3): boolean {
  if (left.x !== right.x) return left.x < right.x;
  if (left.y !== right.y) return left.y < right.y;
  return left.z <= right.z;
}

/**
 * Returns a unit step across the edge and into the face.
 *
 * @param brush Derived brush.
 * @param faceIndex Face index.
 * @param origin Edge origin.
 * @param along Unit edge direction.
 * @param normal Face normal.
 * @returns Unit direction, or null when the edge is parallel to the normal.
 */
function modifierBevelAcrossDirection(
  brush: SolidBrush,
  faceIndex: number,
  origin: Vector3,
  along: Vector3,
  normal: Vector3,
): Vector3 | null {
  const across = new Vector3().crossVectors(normal, along);
  if (across.lengthSq() <= 1e-16) return null;
  across.normalize();
  const face = brush.faces[faceIndex];
  const centroid = face ? modifierBevelFaceCentroid(brush.getFaceVertices(face)) : origin;
  if (across.dot(centroid.clone().sub(origin)) < 0) across.negate();
  return across;
}

/**
 * Returns the average of a face.
 *
 * @param points Face vertices.
 * @returns Centroid, or the origin when the face is empty.
 */
function modifierBevelFaceCentroid(points: readonly Vector3[]): Vector3 {
  const centroid = new Vector3();
  if (points.length === 0) return centroid;
  for (const point of points) centroid.add(point);
  return centroid.multiplyScalar(1 / points.length);
}

/**
 * Records the along and across bounds of a face.
 *
 * @param brush Derived brush.
 * @param faceIndex Face index.
 * @param origin Frame origin.
 * @param along Unit along direction.
 * @param across Unit across direction.
 * @returns Measured frame.
 */
function modifierBevelMeasureFrame(
  brush: SolidBrush,
  faceIndex: number,
  origin: Vector3,
  along: Vector3,
  across: Vector3,
): ModifierBevelLayoutFrame {
  const face = brush.faces[faceIndex];
  const points = face ? brush.getFaceVertices(face) : [];
  return modifierBevelLayoutFrameFromPoints(points, origin, along, across);
}

/**
 * Measures along and across bounds for points already in the frame's space.
 *
 * @param points Face vertices.
 * @param origin Frame origin.
 * @param along Unit along direction.
 * @param across Unit across direction.
 * @returns Measured frame.
 */
export function modifierBevelLayoutFrameFromPoints(
  points: readonly Vector3[],
  origin: Vector3,
  along: Vector3,
  across: Vector3,
): ModifierBevelLayoutFrame {
  const bounds = modifierBevelProjectPointBounds(points, origin, along, across);
  return modifierBevelFrameFromBounds(origin, along, across, bounds);
}

/**
 * Stores one measured frame.
 *
 * @param origin Frame origin.
 * @param along Unit along direction.
 * @param across Unit across direction.
 * @param bounds Axis bounds.
 * @returns Measured frame.
 */
function modifierBevelFrameFromBounds(
  origin: Vector3,
  along: Vector3,
  across: Vector3,
  bounds: { minAlong: number; maxAlong: number; minAcross: number; maxAcross: number },
): ModifierBevelLayoutFrame {
  return {
    origin,
    along,
    across,
    minAlong: bounds.minAlong,
    minAcross: bounds.minAcross,
    alongSpan: Math.max(bounds.maxAlong - bounds.minAlong, 1e-8),
    acrossSpan: Math.max(bounds.maxAcross - bounds.minAcross, 1e-8),
  };
}

/**
 * Projects points onto the frame axes.
 *
 * @param points Face vertices.
 * @param origin Frame origin.
 * @param along Unit along direction.
 * @param across Unit across direction.
 * @returns Axis bounds.
 */
function modifierBevelProjectPointBounds(
  points: readonly Vector3[],
  origin: Vector3,
  along: Vector3,
  across: Vector3,
): { minAlong: number; maxAlong: number; minAcross: number; maxAcross: number } {
  const bounds = { minAlong: Number.POSITIVE_INFINITY, maxAlong: 0, minAcross: Number.POSITIVE_INFINITY, maxAcross: 0 };
  for (const point of points) modifierBevelIncludePoint(bounds, point, origin, along, across);
  if (points.length === 0) return { minAlong: 0, maxAlong: 0, minAcross: 0, maxAcross: 0 };
  return bounds;
}

/**
 * Expands bounds by one point.
 *
 * @param bounds Bounds updated in place.
 * @param point Face vertex.
 * @param origin Frame origin.
 * @param along Unit along direction.
 * @param across Unit across direction.
 */
function modifierBevelIncludePoint(
  bounds: { minAlong: number; maxAlong: number; minAcross: number; maxAcross: number },
  point: Vector3,
  origin: Vector3,
  along: Vector3,
  across: Vector3,
): void {
  const delta = point.clone().sub(origin);
  const alongDistance = delta.dot(along);
  const acrossDistance = delta.dot(across);
  bounds.minAlong = Math.min(bounds.minAlong, alongDistance);
  bounds.maxAlong = Math.max(bounds.maxAlong, alongDistance);
  bounds.minAcross = Math.min(bounds.minAcross, acrossDistance);
  bounds.maxAcross = Math.max(bounds.maxAcross, acrossDistance);
}
