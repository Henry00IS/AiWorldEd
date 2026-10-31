import * as THREE from 'three';
import type { SnapFaceSample } from './snap_face_sample.js';
import { snapSolveFaceBasis } from '@/snap/solve/snap_solve_face_basis.js';
import { snapSolveSeatDelta } from '@/snap/solve/snap_solve_seat.js';
import { applyWorldPivotRotation } from '@/transform/core/transform_world_pose.js';

/**
 * Rotates a root so the source face looks at the target face. The source
 * centroid stays fixed.
 *
 * @param root Object to rotate.
 * @param startPosition Local position before the operation.
 * @param startQuaternion Local quaternion before the operation.
 * @param source Face that turns.
 * @param target Face to look at.
 */
export function applySnapFaceAlign(
  root: THREE.Object3D,
  startPosition: THREE.Vector3,
  startQuaternion: THREE.Quaternion,
  source: SnapFaceSample,
  target: SnapFaceSample,
): void {
  const rotation = snapSolveFaceBasis(source.normal, source.tangent, target.normal);
  applyWorldPivotRotation(root, startPosition, startQuaternion, source.centroid, rotation, new THREE.Vector3());
}

/**
 * Slides a root along the target normal until the closest source corner meets
 * the target plane. Orientation stays unchanged.
 *
 * @param root Object to slide.
 * @param startPosition Local position before the operation.
 * @param startQuaternion Local quaternion before the operation.
 * @param source Face that moves.
 * @param target Face to land on.
 */
export function applySnapFaceSeat(
  root: THREE.Object3D,
  startPosition: THREE.Vector3,
  startQuaternion: THREE.Quaternion,
  source: SnapFaceSample,
  target: SnapFaceSample,
): void {
  const slide = snapSolveSeatDelta(seatPoints(source), target.point, target.normal);
  applyWorldPivotRotation(root, startPosition, startQuaternion, source.centroid, new THREE.Quaternion(), slide);
}

/**
 * Returns the source corners, or the centroid when the face has none.
 *
 * @param source Face that moves.
 * @returns Points that decide the slide.
 */
function seatPoints(source: SnapFaceSample): readonly THREE.Vector3[] {
  if (source.corners.length > 0) {
    return source.corners;
  }
  return [source.centroid];
}
