import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { BrushMembership } from '@/solid/algorithm/spatial/brush_membership.js';
import {
  BRUSH_MEMBERSHIP_ALIGNED_FACE_REACH,
  BrushMembershipAlignedFaceReach,
} from '@/solid/algorithm/spatial/brush_membership_aligned_face_reach.js';
import { SOLID_FAT_PLANE_EPSILON } from '@/solid/algorithm/math/solid_math_constants.js';
import { SurfaceCategory } from '@/solid/types/surface_category.js';

/** Length of the test wedges along Z. */
const WEDGE_LENGTH = 1;

/** Up direction, normal of the top face of every test wedge. */
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Builds a prism brush from a counter-clockwise XY profile, centred on Z.
 *
 * @param profile Profile corners in XY, counter-clockwise.
 * @returns Convex brush.
 */
function prism(profile: readonly THREE.Vector2[]): SolidBrush {
  const front = profile.map((corner) => new THREE.Vector3(corner.x, corner.y, WEDGE_LENGTH / 2));
  const back = profile.map((corner) => new THREE.Vector3(corner.x, corner.y, -WEDGE_LENGTH / 2));
  const sides = profile.map((_, index) => {
    const next = (index + 1) % profile.length;
    return [front[next]!, front[index]!, back[index]!, back[next]!];
  });
  const brush = SolidBrushFactory.createFromFaceLoops([front, [...back].reverse(), ...sides]);
  if (!brush) throw new Error('prism does not close');
  return brush;
}

/**
 * Builds a wedge whose flat top runs along +X from the origin and whose
 * underside rises to meet it at the sharp edge, under the given angle.
 *
 * @param width Width of the top face along X.
 * @param angle Angle between the top face and the underside, in radians.
 * @returns Wedge brush with its sharp edge at the origin.
 */
function wedge(width: number, angle: number): SolidBrush {
  const far = new THREE.Vector2(width, 0);
  const below = new THREE.Vector2(width, -width * Math.tan(angle));
  return prism([new THREE.Vector2(0, 0), below, far]);
}

/**
 * Returns a point on the top plane of a wedge, a distance out along -X from the
 * sharp edge and slightly above the plane.
 *
 * @param besideEdge Distance past the sharp edge along the top plane.
 * @param abovePlane Height above the top plane.
 * @returns Test point.
 */
function pointBesideEdge(besideEdge: number, abovePlane: number): THREE.Vector3 {
  return new THREE.Vector3(-besideEdge, abovePlane, 0);
}

describe('BrushMembershipAlignedFaceReach', () => {
  const nearlyFlat = SOLID_FAT_PLANE_EPSILON / (4 * BRUSH_MEMBERSHIP_ALIGNED_FACE_REACH);
  const thinWedge = wedge(0.05, nearlyFlat);
  const squareWedge = wedge(0.05, Math.PI / 4);

  it('finds a point beside a thin wedge aligned with its top, though no face covers it', () => {
    const beside = pointBesideEdge(2 * BRUSH_MEMBERSHIP_ALIGNED_FACE_REACH, SOLID_FAT_PLANE_EPSILON / 10);
    expect(BrushMembership.classifyPoint(beside, thinWedge, UP)).toBe(SurfaceCategory.Aligned);
    expect(BrushMembershipAlignedFaceReach.isPointOffClosestFace(beside, thinWedge)).toBe(true);
  });

  it('keeps a point on the top face, or just past its edge, on the face', () => {
    const onTop = new THREE.Vector3(0.025, SOLID_FAT_PLANE_EPSILON / 10, 0);
    const justPast = pointBesideEdge(BRUSH_MEMBERSHIP_ALIGNED_FACE_REACH / 2, SOLID_FAT_PLANE_EPSILON / 10);
    expect(BrushMembershipAlignedFaceReach.isPointOffClosestFace(onTop, thinWedge)).toBe(false);
    expect(BrushMembershipAlignedFaceReach.isPointOffClosestFace(justPast, thinWedge)).toBe(false);
  });

  it('keeps every point of the fat band beside a steep side on the face', () => {
    const inBand = pointBesideEdge(SOLID_FAT_PLANE_EPSILON * 0.9, SOLID_FAT_PLANE_EPSILON / 10);
    expect(BrushMembership.classifyPoint(inBand, squareWedge, UP)).toBe(SurfaceCategory.Aligned);
    expect(BrushMembershipAlignedFaceReach.isPointOffClosestFace(inBand, squareWedge)).toBe(false);
  });

  it('measures the distance beside a side along the face plane', () => {
    const top = BrushMembershipAlignedFaceReach.closestPlane(new THREE.Vector3(0.025, 0, 0), squareWedge)!;
    const side = squareWedge.planes.find((plane) => plane.normal.x < -0.5)!;
    const besideEdge = 0.01;
    const point = pointBesideEdge(besideEdge, 0);
    expect(BrushMembershipAlignedFaceReach.distanceAlongPlane(point, side, top, 0)).toBeCloseTo(besideEdge, 9);
  });

  it('ignores the face plane itself and planes parallel to it', () => {
    const top = BrushMembershipAlignedFaceReach.closestPlane(new THREE.Vector3(0.025, 0, 0), squareWedge)!;
    const anyPoint = new THREE.Vector3(0, 0, 0);
    expect(BrushMembershipAlignedFaceReach.distanceAlongPlane(anyPoint, top, top, 0)).toBe(Number.NEGATIVE_INFINITY);
  });
});
