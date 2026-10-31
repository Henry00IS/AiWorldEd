import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { buildSnapAlignCache, type SnapAlignCache } from '@/snap/tool/snap_align_cache.js';
import { snapAlignFaceCorners, type SnapAlignCornerTriangle } from '@/snap/tool/snap_align_face_corners.js';
import type { SnapFaceSample } from '@/snap/tool/snap_face_sample.js';
import { snapSolveSeatDelta } from '@/snap/solve/snap_solve_seat.js';

/** Edge length of the compiled box used to pick a real face. */
const BOX_SIZE = 1;

/** Corners and shared normal of one planar quad. */
interface PlanarQuad {
  rootId: string;
  normal: THREE.Vector3;
  points: THREE.Vector3[];
}

describe('face corner seating', () => {
  it('slides both triangles of a tilted quad by the closest corner', () => {
    const quad = tiltedQuad();
    expectSameQuadSlide(quadTriangles(quad), quad.points);
  });

  it('returns every corner of a compiled box face and seats that whole face', () => {
    const samples = compiledFrontSamples();
    expect(samples.length).toBeGreaterThan(1);
    expectFrontSamplesAgree(samples);
  });
});

/**
 * Builds a quad whose closest corner belongs to only one triangle.
 *
 * @returns Quad corners and unit normal.
 */
function tiltedQuad(): PlanarQuad {
  const origin = new THREE.Vector3(0, 3, 0);
  const across = new THREE.Vector3(2, -2, 0);
  const depth = new THREE.Vector3(0, 1, 2);
  return {
    rootId: 'source-face',
    normal: across.clone().cross(depth).normalize(),
    points: [origin, origin.clone().add(across), origin.clone().add(across).add(depth), origin.clone().add(depth)],
  };
}

/**
 * Splits a quad into two triangles that share the first-to-third diagonal.
 *
 * @param quad Planar quad.
 * @returns Two coplanar triangles.
 */
function quadTriangles(quad: PlanarQuad): SnapAlignCornerTriangle[] {
  const first = quad.points[0];
  const second = quad.points[1];
  const third = quad.points[2];
  const fourth = quad.points[3];
  if (!first || !second || !third || !fourth) {
    throw new Error('quad is incomplete');
  }
  return [cornerTriangle(quad, first, second, third), cornerTriangle(quad, first, third, fourth)];
}

/**
 * Copies one triangle of a quad.
 *
 * @param quad Planar quad.
 * @param a First corner.
 * @param b Second corner.
 * @param c Third corner.
 * @returns Cached triangle.
 */
function cornerTriangle(
  quad: PlanarQuad,
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
): SnapAlignCornerTriangle {
  return {
    rootId: quad.rootId,
    normal: quad.normal.clone(),
    a: a.clone(),
    b: b.clone(),
    c: c.clone(),
  };
}

/**
 * Checks that either triangle seats the whole quad, while each triangle alone
 * would not.
 *
 * @param triangles Coplanar triangles.
 * @param points Quad corners.
 */
function expectSameQuadSlide(triangles: readonly SnapAlignCornerTriangle[], points: readonly THREE.Vector3[]): void {
  const first = triangles[0];
  const second = triangles[1];
  if (!first || !second) {
    throw new Error('quad triangles missing');
  }
  const planePoint = new THREE.Vector3();
  const planeNormal = new THREE.Vector3(0, 1, 0);
  const fromFirst = snapSolveSeatDelta(snapAlignFaceCorners(triangles, first), planePoint, planeNormal);
  const fromSecond = snapSolveSeatDelta(snapAlignFaceCorners(triangles, second), planePoint, planeNormal);
  expect(fromFirst.distanceTo(fromSecond)).toBeLessThan(1e-6);
  expect(snapAlignFaceCorners(triangles, first)).toHaveLength(4);
  expectPlaneTouch(points, planePoint, planeNormal, fromFirst);
  expect(triangleSeatGap(first, planePoint, planeNormal)).not.toBeCloseTo(
    triangleSeatGap(second, planePoint, planeNormal),
  );
}

/**
 * Returns the seat distance of one triangle's own corners.
 *
 * @param triangle Triangle to measure.
 * @param planePoint Point on the target plane.
 * @param planeNormal Target normal.
 * @returns Smallest signed distance.
 */
function triangleSeatGap(
  triangle: SnapAlignCornerTriangle,
  planePoint: THREE.Vector3,
  planeNormal: THREE.Vector3,
): number {
  return minimumSignedDistance([triangle.a, triangle.b, triangle.c], planePoint, planeNormal);
}

/**
 * Returns the smallest signed distance from points to a plane.
 *
 * @param points Points to measure.
 * @param planePoint Point on the plane.
 * @param planeNormal Plane normal.
 * @returns Smallest signed distance.
 */
function minimumSignedDistance(
  points: readonly THREE.Vector3[],
  planePoint: THREE.Vector3,
  planeNormal: THREE.Vector3,
): number {
  const unit = planeNormal.clone().normalize();
  let closest = 0;
  let found = false;
  for (const point of points) {
    const distance = point.clone().sub(planePoint).dot(unit);
    if (!found || distance < closest) {
      closest = distance;
      found = true;
    }
  }
  return closest;
}

/**
 * Checks that a slide puts the closest point on the plane and keeps the rest in
 * front.
 *
 * @param points Source points.
 * @param planePoint Point on the target plane.
 * @param planeNormal Target normal.
 * @param delta Seat translation.
 */
function expectPlaneTouch(
  points: readonly THREE.Vector3[],
  planePoint: THREE.Vector3,
  planeNormal: THREE.Vector3,
  delta: THREE.Vector3,
): void {
  const unit = planeNormal.clone().normalize();
  const distances = points.map((point) => point.clone().add(delta).sub(planePoint).dot(unit));
  expect(Math.min(...distances)).toBeCloseTo(0);
  for (const distance of distances) {
    expect(distance).toBeGreaterThanOrEqual(-1e-5);
  }
}

/**
 * Picks several rays on the front face of a compiled box.
 *
 * @returns Face samples.
 */
function compiledFrontSamples(): SnapFaceSample[] {
  const model = new SolidModel('SeatBox');
  const brush = model.addBoxBrush(BOX_SIZE, SolidOperation.Additive, null, false);
  brush.pushTransformToMesh();
  model.markDirty();
  model.rebuild(true);
  model.root.updateMatrixWorld(true);
  return frontSamples(buildSnapAlignCache(model.root));
}

/**
 * Picks the front face from several points inside its bounds.
 *
 * @param cache Align cache.
 * @returns Samples that hit.
 */
function frontSamples(cache: SnapAlignCache): SnapFaceSample[] {
  const samples: SnapFaceSample[] = [];
  for (const origin of frontOrigins()) {
    const sample = cache.pickFace(origin, new THREE.Vector3(0, 0, -1), null);
    if (sample) {
      samples.push(sample);
    }
  }
  return samples;
}

/**
 * Returns ray origins aimed at the four quadrants of the front face.
 *
 * @returns World origins.
 */
function frontOrigins(): THREE.Vector3[] {
  const inset = BOX_SIZE * 0.2;
  const reach = BOX_SIZE * 4;
  return [
    new THREE.Vector3(inset, inset, reach),
    new THREE.Vector3(-inset, inset, reach),
    new THREE.Vector3(inset, -inset, reach),
    new THREE.Vector3(-inset, -inset, reach),
  ];
}

/**
 * Checks that every front sample carries the whole face and the same slide.
 *
 * @param samples Front face samples.
 */
function expectFrontSamplesAgree(samples: readonly SnapFaceSample[]): void {
  const first = samples[0];
  if (!first) {
    throw new Error('front face missing');
  }
  const planePoint = new THREE.Vector3();
  const planeNormal = new THREE.Vector3(0, 0, 1);
  const expected = snapSolveSeatDelta(first.corners, planePoint, planeNormal);
  for (const sample of samples) {
    expect(sample.corners).toHaveLength(4);
    expect(snapSolveSeatDelta(sample.corners, planePoint, planeNormal).distanceTo(expected)).toBeLessThan(1e-5);
  }
  expectPlaneTouch(first.corners, planePoint, planeNormal, expected);
}
