import * as THREE from 'three';
import type { SnapHit } from '@/snap/hit/snap_hit.js';
import { buildSnapHingeCircle, snapHingeAngleOfPoint } from './snap_hinge_circle.js';
import { snapHingeAngleToPlane } from './snap_hinge_plane_angle.js';
import { snapHingeRampAngle } from './snap_hinge_ramp_angle.js';
import { snapHingeAngleToSegment } from './snap_hinge_segment_angle.js';

/** Inputs for one hinge-align angle solve. */
export interface SnapHingeSolveInput {
  hingePoint: THREE.Vector3;
  hingeDirection: THREE.Vector3;
  riderPoint: THREE.Vector3;
  faceNormal: THREE.Vector3 | null;
  hit: SnapHit;
  unsnappedAngle: number;
}

/**
 * Rotation about the hinge that brings the rider onto the hit. Parallel and
 * coplanar edge hits lay the supplied face into the shared plane. Other hits
 * use the rider circle. Returns null when the rider is on the hinge.
 *
 * @param input Hinge, rider, optional face, and the snap hit.
 * @returns Angle in radians from the current pose, or null.
 */
export function snapSolveHingeAngle(input: SnapHingeSolveInput): number | null {
  const circle = buildSnapHingeCircle(input.hingePoint, input.hingeDirection, input.riderPoint);
  if (!circle) {
    return null;
  }
  const ramp = solveRampWhenFacePresent(input, circle);
  if (ramp !== null) {
    return ramp;
  }
  return solveCircleHit(input, circle);
}

/**
 * Tries the ramp plane when the caller supplied a face and the hit is an edge.
 *
 * @param input Solve input.
 * @param circle Rider circle.
 * @returns Ramp angle, or null when the ramp case does not apply.
 */
function solveRampWhenFacePresent(
  input: SnapHingeSolveInput,
  circle: ReturnType<typeof buildSnapHingeCircle>,
): number | null {
  if (!circle || !input.faceNormal || input.hit.kind !== 'edge') {
    return null;
  }
  const segmentStart = input.hit.segmentStart;
  const segmentEnd = input.hit.segmentEnd;
  if (!segmentStart || !segmentEnd) {
    return null;
  }
  return snapHingeRampAngle(circle, input.faceNormal, input.hingePoint, segmentStart, segmentEnd, input.unsnappedAngle);
}

/**
 * Solves a vertex, edge, or face hit on the rider circle.
 *
 * @param input Solve input.
 * @param circle Rider circle.
 * @returns Angle in radians.
 */
function solveCircleHit(
  input: SnapHingeSolveInput,
  circle: NonNullable<ReturnType<typeof buildSnapHingeCircle>>,
): number {
  if (input.hit.kind === 'face') {
    return snapHingeAngleToPlane(circle, input.hit.point, input.hit.normal, input.unsnappedAngle);
  }
  if (input.hit.kind === 'edge' && input.hit.segmentStart && input.hit.segmentEnd) {
    return snapHingeAngleToSegment(circle, input.hit.segmentStart, input.hit.segmentEnd, input.unsnappedAngle);
  }
  return snapHingeAngleOfPoint(circle, input.hit.point);
}
