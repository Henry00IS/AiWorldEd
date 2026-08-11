import * as THREE from 'three';

/**
 * Writes the closest point on triangle ABC to the query point.
 *
 * @param point Query point.
 * @param vertexA Triangle vertex A.
 * @param vertexB Triangle vertex B.
 * @param vertexC Triangle vertex C.
 * @param target Destination for the closest point.
 * @returns The target vector.
 */
export function playerClosestPointOnTriangle(
  point: THREE.Vector3,
  vertexA: THREE.Vector3,
  vertexB: THREE.Vector3,
  vertexC: THREE.Vector3,
  target: THREE.Vector3,
): THREE.Vector3 {
  const ab = scratchAb.subVectors(vertexB, vertexA);
  const ac = scratchAc.subVectors(vertexC, vertexA);
  const ap = scratchAp.subVectors(point, vertexA);
  const d1 = ab.dot(ap);
  const d2 = ac.dot(ap);
  if (d1 <= 0 && d2 <= 0) {
    return target.copy(vertexA);
  }
  return playerClosestPointOnTriangleContinued(point, vertexA, vertexB, vertexC, ab, ac, d1, d2, target);
}

/**
 * Continues closest-point classification after the vertex-A voronoi region.
 *
 * @param point Query point.
 * @param vertexA Triangle vertex A.
 * @param vertexB Triangle vertex B.
 * @param vertexC Triangle vertex C.
 * @param ab Edge AB.
 * @param ac Edge AC.
 * @param d1 Dot AB·AP.
 * @param d2 Dot AC·AP.
 * @param target Destination for the closest point.
 * @returns The target vector.
 */
function playerClosestPointOnTriangleContinued(
  point: THREE.Vector3,
  vertexA: THREE.Vector3,
  vertexB: THREE.Vector3,
  vertexC: THREE.Vector3,
  ab: THREE.Vector3,
  ac: THREE.Vector3,
  d1: number,
  d2: number,
  target: THREE.Vector3,
): THREE.Vector3 {
  const bp = scratchBp.subVectors(point, vertexB);
  const d3 = ab.dot(bp);
  const d4 = ac.dot(bp);
  if (d3 >= 0 && d4 <= d3) {
    return target.copy(vertexB);
  }
  const cp = scratchCp.subVectors(point, vertexC);
  const d5 = ab.dot(cp);
  const d6 = ac.dot(cp);
  if (d6 >= 0 && d5 <= d6) {
    return target.copy(vertexC);
  }
  return playerClosestPointOnTriangleEdges(vertexA, vertexB, vertexC, ab, ac, d1, d2, d3, d4, d5, d6, target);
}

/**
 * Resolves edge and face regions for triangle closest-point.
 *
 * @param vertexA Triangle vertex A.
 * @param vertexB Triangle vertex B.
 * @param vertexC Triangle vertex C.
 * @param ab Edge AB.
 * @param ac Edge AC.
 * @param d1 Dot AB·AP.
 * @param d2 Dot AC·AP.
 * @param d3 Dot AB·BP.
 * @param d4 Dot AC·BP.
 * @param d5 Dot AB·CP.
 * @param d6 Dot AC·CP.
 * @param target Destination for the closest point.
 * @returns The target vector.
 */
function playerClosestPointOnTriangleEdges(
  vertexA: THREE.Vector3,
  vertexB: THREE.Vector3,
  vertexC: THREE.Vector3,
  ab: THREE.Vector3,
  ac: THREE.Vector3,
  d1: number,
  d2: number,
  d3: number,
  d4: number,
  d5: number,
  d6: number,
  target: THREE.Vector3,
): THREE.Vector3 {
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const scale = d1 / (d1 - d3);
    return target.copy(vertexA).addScaledVector(ab, scale);
  }
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const scale = d2 / (d2 - d6);
    return target.copy(vertexA).addScaledVector(ac, scale);
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const scale = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return target.copy(vertexB).addScaledVector(scratchBc.subVectors(vertexC, vertexB), scale);
  }
  const denom = 1 / (va + vb + vc);
  return target
    .copy(vertexA)
    .addScaledVector(ab, vb * denom)
    .addScaledVector(ac, vc * denom);
}

/**
 * Writes closest points between a segment and a triangle and returns distance.
 *
 * @param segmentStart Segment start.
 * @param segmentEnd Segment end.
 * @param vertexA Triangle vertex A.
 * @param vertexB Triangle vertex B.
 * @param vertexC Triangle vertex C.
 * @param outOnSegment Closest point on the segment.
 * @param outOnTriangle Closest point on the triangle.
 * @returns Euclidean distance between the closest points.
 */
export function playerClosestPointsSegmentTriangle(
  segmentStart: THREE.Vector3,
  segmentEnd: THREE.Vector3,
  vertexA: THREE.Vector3,
  vertexB: THREE.Vector3,
  vertexC: THREE.Vector3,
  outOnSegment: THREE.Vector3,
  outOnTriangle: THREE.Vector3,
): number {
  playerClosestPointsSegmentTriangleSeed(
    segmentStart,
    segmentEnd,
    vertexA,
    vertexB,
    vertexC,
    outOnSegment,
    outOnTriangle,
  );
  playerClosestPointsSegmentTriangleEdges(
    segmentStart,
    segmentEnd,
    vertexA,
    vertexB,
    vertexC,
    outOnSegment,
    outOnTriangle,
  );
  return outOnSegment.distanceTo(outOnTriangle);
}

/**
 * Seeds closest points using endpoint-to-triangle samples.
 *
 * @param segmentStart Segment start.
 * @param segmentEnd Segment end.
 * @param vertexA Triangle vertex A.
 * @param vertexB Triangle vertex B.
 * @param vertexC Triangle vertex C.
 * @param outOnSegment Closest point on the segment.
 * @param outOnTriangle Closest point on the triangle.
 */
function playerClosestPointsSegmentTriangleSeed(
  segmentStart: THREE.Vector3,
  segmentEnd: THREE.Vector3,
  vertexA: THREE.Vector3,
  vertexB: THREE.Vector3,
  vertexC: THREE.Vector3,
  outOnSegment: THREE.Vector3,
  outOnTriangle: THREE.Vector3,
): void {
  playerClosestPointOnTriangle(segmentStart, vertexA, vertexB, vertexC, scratchTriPoint);
  let bestDistSq = segmentStart.distanceToSquared(scratchTriPoint);
  outOnSegment.copy(segmentStart);
  outOnTriangle.copy(scratchTriPoint);
  playerClosestPointOnTriangle(segmentEnd, vertexA, vertexB, vertexC, scratchTriPoint);
  const endDistSq = segmentEnd.distanceToSquared(scratchTriPoint);
  if (endDistSq < bestDistSq) {
    bestDistSq = endDistSq;
    outOnSegment.copy(segmentEnd);
    outOnTriangle.copy(scratchTriPoint);
  }
  playerConsiderPlaneIntersection(
    segmentStart,
    segmentEnd,
    vertexA,
    vertexB,
    vertexC,
    bestDistSq,
    outOnSegment,
    outOnTriangle,
  );
}

/**
 * Considers the segment-plane intersection if it lands inside the triangle.
 *
 * @param segmentStart Segment start.
 * @param segmentEnd Segment end.
 * @param vertexA Triangle vertex A.
 * @param vertexB Triangle vertex B.
 * @param vertexC Triangle vertex C.
 * @param bestDistSq Current best distance squared.
 * @param outOnSegment Closest point on the segment.
 * @param outOnTriangle Closest point on the triangle.
 */
function playerConsiderPlaneIntersection(
  segmentStart: THREE.Vector3,
  segmentEnd: THREE.Vector3,
  vertexA: THREE.Vector3,
  vertexB: THREE.Vector3,
  vertexC: THREE.Vector3,
  bestDistSq: number,
  outOnSegment: THREE.Vector3,
  outOnTriangle: THREE.Vector3,
): void {
  scratchAb.subVectors(vertexB, vertexA);
  scratchAc.subVectors(vertexC, vertexA);
  scratchNormal.crossVectors(scratchAb, scratchAc);
  const normalLengthSq = scratchNormal.lengthSq();
  if (normalLengthSq < 1e-20) {
    return;
  }
  scratchSegment.subVectors(segmentEnd, segmentStart);
  const denom = scratchNormal.dot(scratchSegment);
  if (Math.abs(denom) < 1e-12) {
    return;
  }
  const t = scratchNormal.dot(scratchAp.subVectors(vertexA, segmentStart)) / denom;
  if (t < 0 || t > 1) {
    return;
  }
  scratchSegPoint.copy(segmentStart).addScaledVector(scratchSegment, t);
  playerClosestPointOnTriangle(scratchSegPoint, vertexA, vertexB, vertexC, scratchTriPoint);
  const distSq = scratchSegPoint.distanceToSquared(scratchTriPoint);
  if (distSq + 1e-12 < bestDistSq) {
    outOnSegment.copy(scratchSegPoint);
    outOnTriangle.copy(scratchTriPoint);
  }
}

/**
 * Refines closest points using segment-vs-triangle-edge pairs.
 *
 * @param segmentStart Segment start.
 * @param segmentEnd Segment end.
 * @param vertexA Triangle vertex A.
 * @param vertexB Triangle vertex B.
 * @param vertexC Triangle vertex C.
 * @param outOnSegment Closest point on the segment.
 * @param outOnTriangle Closest point on the triangle.
 */
function playerClosestPointsSegmentTriangleEdges(
  segmentStart: THREE.Vector3,
  segmentEnd: THREE.Vector3,
  vertexA: THREE.Vector3,
  vertexB: THREE.Vector3,
  vertexC: THREE.Vector3,
  outOnSegment: THREE.Vector3,
  outOnTriangle: THREE.Vector3,
): void {
  let bestDistSq = outOnSegment.distanceToSquared(outOnTriangle);
  bestDistSq = playerConsiderSegmentPair(
    segmentStart,
    segmentEnd,
    vertexA,
    vertexB,
    bestDistSq,
    outOnSegment,
    outOnTriangle,
  );
  bestDistSq = playerConsiderSegmentPair(
    segmentStart,
    segmentEnd,
    vertexB,
    vertexC,
    bestDistSq,
    outOnSegment,
    outOnTriangle,
  );
  playerConsiderSegmentPair(segmentStart, segmentEnd, vertexC, vertexA, bestDistSq, outOnSegment, outOnTriangle);
}

/**
 * Considers closest points between two segments and keeps the global best.
 *
 * @param aStart First segment start.
 * @param aEnd First segment end.
 * @param bStart Second segment start.
 * @param bEnd Second segment end.
 * @param bestDistSq Current best distance squared.
 * @param outOnSegment Closest point on the first segment.
 * @param outOnTriangle Closest point on the second segment.
 * @returns Updated best distance squared.
 */
function playerConsiderSegmentPair(
  aStart: THREE.Vector3,
  aEnd: THREE.Vector3,
  bStart: THREE.Vector3,
  bEnd: THREE.Vector3,
  bestDistSq: number,
  outOnSegment: THREE.Vector3,
  outOnTriangle: THREE.Vector3,
): number {
  playerClosestPointsSegmentSegment(aStart, aEnd, bStart, bEnd, scratchSegPoint, scratchTriPoint);
  const distSq = scratchSegPoint.distanceToSquared(scratchTriPoint);
  if (distSq + 1e-12 < bestDistSq) {
    outOnSegment.copy(scratchSegPoint);
    outOnTriangle.copy(scratchTriPoint);
    return distSq;
  }
  return bestDistSq;
}

/**
 * Writes closest points between two finite segments.
 *
 * @param aStart First segment start.
 * @param aEnd First segment end.
 * @param bStart Second segment start.
 * @param bEnd Second segment end.
 * @param outOnA Closest point on the first segment.
 * @param outOnB Closest point on the second segment.
 */
export function playerClosestPointsSegmentSegment(
  aStart: THREE.Vector3,
  aEnd: THREE.Vector3,
  bStart: THREE.Vector3,
  bEnd: THREE.Vector3,
  outOnA: THREE.Vector3,
  outOnB: THREE.Vector3,
): void {
  scratchAb.subVectors(aEnd, aStart);
  scratchAc.subVectors(bEnd, bStart);
  scratchAp.subVectors(aStart, bStart);
  const aLenSq = scratchAb.lengthSq();
  const bLenSq = scratchAc.lengthSq();
  const aDotB = scratchAb.dot(scratchAc);
  const aDotAp = scratchAb.dot(scratchAp);
  const bDotAp = scratchAc.dot(scratchAp);
  let s = 0;
  let t = 0;
  const denom = aLenSq * bLenSq - aDotB * aDotB;
  if (denom > 1e-12 && aLenSq > 1e-12) {
    s = THREE.MathUtils.clamp((aDotB * bDotAp - bLenSq * aDotAp) / denom, 0, 1);
  }
  if (bLenSq > 1e-12) {
    t = (aDotB * s + bDotAp) / bLenSq;
  }
  if (t < 0) {
    t = 0;
    s = aLenSq > 1e-12 ? THREE.MathUtils.clamp(-aDotAp / aLenSq, 0, 1) : 0;
  } else if (t > 1) {
    t = 1;
    s = aLenSq > 1e-12 ? THREE.MathUtils.clamp((aDotB - aDotAp) / aLenSq, 0, 1) : 0;
  }
  outOnA.copy(aStart).addScaledVector(scratchAb, s);
  outOnB.copy(bStart).addScaledVector(scratchAc, t);
}

/**
 * Writes a unit triangle normal from three vertices.
 *
 * @param vertexA Triangle vertex A.
 * @param vertexB Triangle vertex B.
 * @param vertexC Triangle vertex C.
 * @param target Destination normal.
 * @returns True when the triangle has a usable area.
 */
export function playerTriangleNormalFromVertices(
  vertexA: THREE.Vector3,
  vertexB: THREE.Vector3,
  vertexC: THREE.Vector3,
  target: THREE.Vector3,
): boolean {
  scratchAb.subVectors(vertexB, vertexA);
  scratchAc.subVectors(vertexC, vertexA);
  target.crossVectors(scratchAb, scratchAc);
  const length = target.length();
  if (length < 1e-12) {
    target.set(0, 1, 0);
    return false;
  }
  target.multiplyScalar(1 / length);
  return true;
}

const scratchAb = new THREE.Vector3();
const scratchAc = new THREE.Vector3();
const scratchAp = new THREE.Vector3();
const scratchBp = new THREE.Vector3();
const scratchCp = new THREE.Vector3();
const scratchBc = new THREE.Vector3();
const scratchNormal = new THREE.Vector3();
const scratchSegment = new THREE.Vector3();
const scratchSegPoint = new THREE.Vector3();
const scratchTriPoint = new THREE.Vector3();
