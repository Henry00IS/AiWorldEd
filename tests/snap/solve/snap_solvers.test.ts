import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GizmoAxis } from '@/types/transform_mode.js';
import { createSnapHit } from '@/snap/hit/snap_hit.js';
import { SnapPolicy } from '@/snap/policy/snap_policy.js';
import { chooseSnapHit } from '@/snap/query/snap_query_winner.js';
import { snapSolveConstrainedTranslation } from '@/snap/solve/snap_solve_constraint_project.js';
import { snapSolveFaceBasis } from '@/snap/solve/snap_solve_face_basis.js';
import { buildSnapHingeCircle, snapHingePointAtAngle } from '@/snap/solve/snap_hinge_circle.js';
import { snapSolveHingeAngle } from '@/snap/solve/snap_solve_hinge_angle.js';
import { snapSolveSeatDelta } from '@/snap/solve/snap_solve_seat.js';
import { snapDistanceToSegment } from '@/snap/solve/snap_segment_distance.js';
import { snapSolveTranslateDelta } from '@/snap/solve/snap_solve_translate.js';
import { TransformModalAxis } from '@/transform/modal/transform_modal_axis.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';

const identity = new THREE.Quaternion();

describe('snap policy', () => {
  it('stays inactive until the master switch and a kind are on', () => {
    const policy = new SnapPolicy();
    expect(policy.isGeometrySnapActive()).toBe(false);
    policy.setVertexEnabled(true);
    expect(policy.allowsKind('vertex')).toBe(false);
    policy.setMasterEnabled(true);
    expect(policy.allowsKind('vertex')).toBe(true);
    expect(policy.allowsKind('edge')).toBe(false);
    policy.setShiftHeld(true);
    expect(policy.isGeometrySnapActive()).toBe(false);
  });
});

describe('snap translate and constraint', () => {
  it('moves the source point onto the target and keeps a second offset', () => {
    const source = new THREE.Vector3(1, 2, 3);
    const target = new THREE.Vector3(4, -1, 8);
    const delta = snapSolveTranslateDelta(source, target);
    const moved = source.clone().add(delta);
    expect(moved.distanceTo(target)).toBeCloseTo(0);
    const companion = new THREE.Vector3(2, 2, 3);
    const companionOffset = companion.clone().sub(source);
    const movedCompanion = companion.clone().add(delta);
    expect(movedCompanion.sub(moved).distanceTo(companionOffset)).toBeCloseTo(0);
  });

  it('keeps an axis drag on that axis', () => {
    const source = new THREE.Vector3(0, 1, 0);
    const target = new THREE.Vector3(0.4, 6, -3);
    const delta = snapSolveConstrainedTranslation(
      source,
      target,
      TransformModalAxis.None,
      GizmoAxis.X,
      identity,
      identity,
    );
    expect(delta.x).toBeCloseTo(0.4);
    expect(delta.y).toBeCloseTo(0);
    expect(delta.z).toBeCloseTo(0);
    const landed = source.clone().add(delta);
    expect(landed.y).toBeCloseTo(source.y);
    expect(landed.z).toBeCloseTo(source.z);
  });

  it('leaves a free move on the full source-to-target delta', () => {
    const source = new THREE.Vector3(1, 1, 1);
    const target = new THREE.Vector3(2, 4, 7);
    const delta = snapSolveConstrainedTranslation(
      source,
      target,
      TransformModalAxis.None,
      GizmoAxis.VIEW,
      identity,
      identity,
    );
    expect(source.clone().add(delta).distanceTo(target)).toBeCloseTo(0);
  });
});

describe('snap face basis and seat', () => {
  it('returns identity when the source already faces the target', () => {
    const rotation = snapSolveFaceBasis(
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
    );
    expect(rotation.angleTo(new THREE.Quaternion())).toBeCloseTo(0);
  });

  it('half-turns about the source tangent when normals already match', () => {
    const tangent = new THREE.Vector3(1, 0, 0);
    const rotation = snapSolveFaceBasis(new THREE.Vector3(0, 1, 0), tangent, new THREE.Vector3(0, 1, 0));
    const turned = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation);
    expect(turned.distanceTo(new THREE.Vector3(0, -1, 0))).toBeCloseTo(0);
    const bitangent = new THREE.Vector3(0, 0, 1);
    expect(bitangent.clone().applyQuaternion(rotation).distanceTo(bitangent.clone().negate())).toBeCloseTo(0);
    expect(tangent.clone().applyQuaternion(rotation).distanceTo(tangent)).toBeCloseTo(0);
  });

  it('maps the source normal onto the negated target normal', () => {
    const sourceNormal = new THREE.Vector3(0, 0, 1);
    const targetNormal = new THREE.Vector3(0, 1, 0);
    const rotation = snapSolveFaceBasis(sourceNormal, new THREE.Vector3(1, 0, 0), targetNormal);
    const turned = sourceNormal.clone().applyQuaternion(rotation);
    expect(turned.distanceTo(targetNormal.clone().negate())).toBeCloseTo(0);
  });

  it('slides onto the target plane and leaves lateral position unchanged when seated', () => {
    const centroid = new THREE.Vector3(3, 2, -4);
    const targetPoint = new THREE.Vector3(0, 0, 0);
    const targetNormal = new THREE.Vector3(0, 1, 0);
    const delta = snapSolveSeatDelta([centroid], targetPoint, targetNormal);
    const seated = centroid.clone().add(delta);
    expect(seated.dot(targetNormal)).toBeCloseTo(0);
    expect(seated.x).toBeCloseTo(centroid.x);
    expect(seated.z).toBeCloseTo(centroid.z);
  });

  it('reports a zero seat when the centroid is already on the plane', () => {
    const centroid = new THREE.Vector3(2, 0, 5);
    const delta = snapSolveSeatDelta([centroid], new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0));
    expect(delta.length()).toBeCloseTo(0);
  });

  it('seats the nearest corner and keeps the other corners on the starting side', () => {
    const planePoint = new THREE.Vector3(1, -2, 4);
    const planeNormal = new THREE.Vector3(0, 1, 0);
    const nearest = planePoint.clone().addScaledVector(planeNormal, 1);
    const mid = planePoint
      .clone()
      .addScaledVector(planeNormal, 2.5)
      .add(new THREE.Vector3(1, 0, 0));
    const far = planePoint
      .clone()
      .addScaledVector(planeNormal, 4)
      .add(new THREE.Vector3(0, 0, -1));
    const delta = snapSolveSeatDelta([nearest, mid, far], planePoint, planeNormal);
    expectSeatStaysOnPlaneSide([nearest, mid, far], planePoint, planeNormal, delta);
  });
});

describe('snap winner', () => {
  it('prefers a vertex inside the radius over a face under the pointer', () => {
    const vertex = createSnapHit(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(),
      'vertex',
      'root-a',
      'v0',
      8,
      null,
      null,
    );
    const face = createSnapHit(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 1, 0),
      'face',
      'root-b',
      'f0',
      0,
      null,
      null,
    );
    const winner = chooseSnapHit([face, vertex], 20);
    expect(winner?.kind).toBe('vertex');
  });

  it('uses the face when the pointer is far from every vertex and edge', () => {
    const vertex = createSnapHit(new THREE.Vector3(), new THREE.Vector3(), 'vertex', 'root-a', 'v0', 40, null, null);
    const face = createSnapHit(new THREE.Vector3(), new THREE.Vector3(0, 1, 0), 'face', 'root-b', 'f0', 0, null, null);
    expect(chooseSnapHit([vertex, face], 20)?.kind).toBe('face');
  });

  it('prefers the endpoint magnet over an edge interior', () => {
    const interior = createSnapHit(
      new THREE.Vector3(),
      new THREE.Vector3(1, 0, 0),
      'edge',
      'root-a',
      'e-interior',
      6,
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(4, 0, 0),
    );
    const endpoint = createSnapHit(
      new THREE.Vector3(),
      new THREE.Vector3(1, 0, 0),
      'edge',
      'root-a',
      'e-end',
      2,
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(4, 0, 0),
    );
    expect(chooseSnapHit([interior, endpoint], 20)?.elementId).toBe('e-end');
  });
});

describe('snap hinge', () => {
  it('lays a face through a parallel target edge', () => {
    const hingePoint = new THREE.Vector3(0, 0, 0);
    const hingeDirection = new THREE.Vector3(1, 0, 0);
    const rider = new THREE.Vector3(0, 0, 2);
    const faceNormal = new THREE.Vector3(0, 1, 0);
    const segmentStart = new THREE.Vector3(0, 1, 3);
    const segmentEnd = new THREE.Vector3(4, 1, 3);
    const hit = createSnapHit(segmentStart, hingeDirection, 'edge', 'other', 'edge', 0, segmentStart, segmentEnd);
    const angle = snapSolveHingeAngle({
      hingePoint,
      hingeDirection,
      riderPoint: rider,
      faceNormal,
      hit,
      unsnappedAngle: 0,
    });
    expect(angle).not.toBeNull();
    const circle = buildSnapHingeCircle(hingePoint, hingeDirection, rider);
    expect(circle).not.toBeNull();
    if (!circle || angle === null) {
      return;
    }
    const rotatedRider = snapHingePointAtAngle(circle, angle);
    const lateral = segmentStart.clone().sub(hingePoint);
    lateral.addScaledVector(hingeDirection, -lateral.dot(hingeDirection));
    const planeNormal = hingeDirection.clone().cross(lateral).normalize();
    expect(Math.abs(rotatedRider.dot(planeNormal))).toBeCloseTo(0, 5);
    const rotatedNormal = faceNormal
      .clone()
      .applyQuaternion(new THREE.Quaternion().setFromAxisAngle(hingeDirection, angle));
    expect(Math.abs(Math.abs(rotatedNormal.dot(planeNormal)) - 1)).toBeCloseTo(0, 5);
    const hingeSample = hingePoint.clone().add(hingeDirection);
    const rotatedHingeSample = hingeSample
      .clone()
      .applyQuaternion(new THREE.Quaternion().setFromAxisAngle(hingeDirection.clone().normalize(), angle));
    expect(rotatedHingeSample.distanceTo(hingeSample)).toBeCloseTo(0, 5);
  });

  it('puts the rider on a skew edge as close as the circle allows', () => {
    const hingePoint = new THREE.Vector3(0, 0, 0);
    const hingeDirection = new THREE.Vector3(1, 0, 0);
    const rider = new THREE.Vector3(0, 0, 2);
    const segmentStart = new THREE.Vector3(0, 2, 1);
    const segmentEnd = new THREE.Vector3(0, 2, 3);
    const hit = createSnapHit(
      segmentStart,
      new THREE.Vector3(0, 0, 1),
      'edge',
      'other',
      'skew',
      0,
      segmentStart,
      segmentEnd,
    );
    const angle = snapSolveHingeAngle({
      hingePoint,
      hingeDirection,
      riderPoint: rider,
      faceNormal: new THREE.Vector3(0, 1, 0),
      hit,
      unsnappedAngle: 0.2,
    });
    const circle = buildSnapHingeCircle(hingePoint, hingeDirection, rider);
    expect(circle).not.toBeNull();
    if (!circle || angle === null) {
      return;
    }
    const solvedDistance = snapDistanceToSegment(snapHingePointAtAngle(circle, angle), segmentStart, segmentEnd);
    let bestSample = Infinity;
    for (let step = 0; step < 720; step++) {
      const sample = snapHingePointAtAngle(circle, (step / 720) * Math.PI * 2);
      bestSample = Math.min(bestSample, snapDistanceToSegment(sample, segmentStart, segmentEnd));
    }
    expect(solvedDistance).toBeCloseTo(bestSample, 3);
  });

  it('swings a chosen edge onto a parallel target edge', () => {
    const hingePoint = new THREE.Vector3(0, 0, 0);
    const hingeDirection = new THREE.Vector3(1, 0, 0);
    const rider = new THREE.Vector3(0, 1, 0);
    const segmentStart = new THREE.Vector3(0, 0, 1);
    const segmentEnd = new THREE.Vector3(2, 0, 1);
    const hit = createSnapHit(segmentStart, hingeDirection, 'edge', 'landing', 'lip', 0, segmentStart, segmentEnd);
    const angle = snapSolveHingeAngle({
      hingePoint,
      hingeDirection,
      riderPoint: rider,
      faceNormal: null,
      hit,
      unsnappedAngle: 0,
    });
    const circle = buildSnapHingeCircle(hingePoint, hingeDirection, rider);
    expect(circle).not.toBeNull();
    if (!circle || angle === null) {
      return;
    }
    const landed = snapHingePointAtAngle(circle, angle);
    expect(snapDistanceToSegment(landed, segmentStart, segmentEnd)).toBeLessThan(1e-4);
  });

  it('returns null when the rider lies on the hinge', () => {
    const hingePoint = new THREE.Vector3(1, 2, 3);
    const hingeDirection = new THREE.Vector3(0, 1, 0);
    const rider = hingePoint.clone().add(new THREE.Vector3(0, 4, 0));
    const hit = createSnapHit(new THREE.Vector3(5, 5, 5), new THREE.Vector3(), 'vertex', 'other', 'v', 0, null, null);
    const angle = snapSolveHingeAngle({
      hingePoint,
      hingeDirection,
      riderPoint: rider,
      faceNormal: null,
      hit,
      unsnappedAngle: 0,
    });
    expect(angle).toBeNull();
    expect(buildSnapHingeCircle(hingePoint, hingeDirection, rider)).toBeNull();
  });
});

describe('increment fallback helper', () => {
  it('keeps grid rounding available when geometry is not used', () => {
    const grid = new GridSnap(true, 1);
    const delta = new THREE.Vector3(0.4, 1.6, -0.2);
    grid.snapVector3(delta);
    expect(delta.x).toBeCloseTo(0);
    expect(delta.y).toBeCloseTo(2);
    expect(delta.z).toBeCloseTo(0);
  });
});

/**
 * Checks that a seat touches the plane and leaves every point on its front
 * side.
 *
 * @param points Source points.
 * @param planePoint Point on the target plane.
 * @param planeNormal Target normal.
 * @param delta Seat translation.
 */
function expectSeatStaysOnPlaneSide(
  points: readonly THREE.Vector3[],
  planePoint: THREE.Vector3,
  planeNormal: THREE.Vector3,
  delta: THREE.Vector3,
): void {
  const unit = planeNormal.clone().normalize();
  const distances = points.map((point) => point.clone().add(delta).sub(planePoint).dot(unit));
  expect(Math.min(...distances)).toBeCloseTo(0);
  for (const distance of distances) {
    expect(distance).toBeGreaterThanOrEqual(-1e-6);
  }
  expect(delta.clone().cross(unit).length()).toBeLessThan(1e-6);
}
