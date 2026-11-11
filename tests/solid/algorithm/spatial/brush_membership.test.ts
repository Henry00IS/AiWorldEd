import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { BrushMembership } from '@/solid/algorithm/spatial/brush_membership.js';
import { SOLID_FAT_PLANE_EPSILON, SOLID_NORMAL_ALIGN_EPSILON } from '@/solid/algorithm/math/solid_math_constants.js';
import { SolidPlane } from '@/solid/brush/solid_plane.js';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SurfaceCategory } from '@/solid/types/surface_category.js';

/**
 * Builds a unit box and a point on its +X face for coplanar classification.
 *
 * @returns Brush and face-center sample.
 */
function unitBoxOnPositiveXFace(): {
  brush: ReturnType<typeof SolidBrushFactory.createCenteredBox>;
  point: THREE.Vector3;
} {
  const brush = SolidBrushFactory.createCenteredBox(2, 2, 2);
  return { brush, point: new THREE.Vector3(1, 0, 0) };
}

/**
 * Builds a unit normal tilted from +X by a given absolute cos(theta) target.
 *
 * @param targetDot Desired normal.dot(+X).
 * @returns Normalized tilted direction.
 */
function tiltedFromPositiveX(targetDot: number): THREE.Vector3 {
  const clamped = Math.min(1, Math.max(-1, targetDot));
  const y = Math.sqrt(Math.max(0, 1 - clamped * clamped));
  return new THREE.Vector3(clamped, y, 0).normalize();
}

/** BrushMembership coplanar align detection uses Chisel normal epsilon. */
describe('BrushMembership classifyPoint align epsilon', () => {
  it('classifies coplanar points with near-identical normals as Aligned', () => {
    const { brush, point } = unitBoxOnPositiveXFace();
    const normal = tiltedFromPositiveX(SOLID_NORMAL_ALIGN_EPSILON);
    expect(BrushMembership.classifyPoint(point, brush, normal)).toBe(SurfaceCategory.Aligned);
  });

  it('does not treat a 0.99-dot tilt as Aligned (Chisel uses 0.9999)', () => {
    const { brush, point } = unitBoxOnPositiveXFace();
    const looseNormal = tiltedFromPositiveX(0.99);
    expect(looseNormal.dot(new THREE.Vector3(1, 0, 0))).toBeLessThan(SOLID_NORMAL_ALIGN_EPSILON);
    expect(BrushMembership.classifyPoint(point, brush, looseNormal)).toBe(SurfaceCategory.Inside);
  });

  it('classifies reverse-aligned coplanar points with near-opposite normals', () => {
    const { brush, point } = unitBoxOnPositiveXFace();
    const normal = tiltedFromPositiveX(-SOLID_NORMAL_ALIGN_EPSILON);
    expect(BrushMembership.classifyPoint(point, brush, normal)).toBe(SurfaceCategory.ReverseAligned);
  });

  it('does not treat a -0.99-dot tilt as ReverseAligned', () => {
    const { brush, point } = unitBoxOnPositiveXFace();
    const looseNormal = tiltedFromPositiveX(-0.99);
    expect(BrushMembership.classifyPoint(point, brush, looseNormal)).toBe(SurfaceCategory.Inside);
  });
});

describe('BrushMembership isOnCrossingPlane', () => {
  it('accepts a point on a plane that crosses the surface and rejects parallel or distant planes', () => {
    const plane = new SolidPlane(new THREE.Vector3(1, 0, 0), -1);
    const surfaceNormal = new THREE.Vector3(0, 1, 0);
    const pointOnPlane = new THREE.Vector3(1, 0.3, -0.2);
    expect(BrushMembership.isOnCrossingPlane(pointOnPlane, plane, surfaceNormal)).toBe(true);
    expect(BrushMembership.isOnCrossingPlane(pointOnPlane, plane, new THREE.Vector3(1, 0, 0))).toBe(false);
    const pointPastBand = new THREE.Vector3(1 + SOLID_FAT_PLANE_EPSILON * 2, 0, 0);
    expect(BrushMembership.isOnCrossingPlane(pointPastBand, plane, surfaceNormal)).toBe(false);
  });
});
