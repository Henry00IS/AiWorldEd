import * as THREE from 'three';
import type { PreparedBrush } from '@/solid/algorithm/compile/solid_compile_types.js';
import type { SolidPlane } from '@/solid/brush/solid_plane.js';
import { SolidBoundsOps } from '@/solid/algorithm/math/solid_bounds_ops.js';
import { SolidPlaneBounds } from '@/solid/algorithm/math/solid_plane_bounds.js';
import { SolidPlaneBoundsResult } from '@/solid/algorithm/math/solid_plane_bounds_result.js';
import { SOLID_ALGORITHM_INFINITE_PREPARED_INDEX } from './solid_algorithm_compact_node.js';
import { SolidAlgorithmIntersectionType } from './solid_algorithm_intersection_type.js';
import { SolidAlgorithmBrushPairMemo } from './solid_algorithm_brush_pair_memo.js';

/**
 * Classifies how two prepared brushes (or the infinite inverted brush) touch,
 * matching ConvexPolytopeTouching / IntersectionType.
 *
 * BInsideA / AInsideB require every vertex of the inner brush to lie strictly
 * inside every outer plane. On-plane contact is Intersection so flush openings
 * still receive cut planes.
 */
export class SolidAlgorithmBrushIntersection {
  private static readonly scratchPoint = new THREE.Vector3();
  private static readonly touchTypeMemo = new SolidAlgorithmBrushPairMemo<{
    epsilon: number;
    subjectBounds: THREE.Box3;
    otherBounds: THREE.Box3;
    type: SolidAlgorithmIntersectionType;
  }>();

  /**
   * Returns the intersection type of other relative to the processed subject.
   *
   * @param subject Prepared subject brush.
   * @param otherPreparedIndex Other prepared index, or infinite index.
   * @param prepared All prepared brushes.
   * @param boundsPad Bounds padding.
   * @param membershipEpsilon Plane epsilon.
   * @returns Intersection type for CreateRoutingTableJob.
   */
  static classify(
    subject: PreparedBrush,
    otherPreparedIndex: number,
    prepared: readonly PreparedBrush[],
    boundsPad: number,
    membershipEpsilon: number,
  ): SolidAlgorithmIntersectionType {
    if (otherPreparedIndex === SOLID_ALGORITHM_INFINITE_PREPARED_INDEX) {
      return SolidAlgorithmIntersectionType.AInsideB;
    }
    const other = prepared[otherPreparedIndex];
    if (!other) {
      return SolidAlgorithmIntersectionType.NoIntersection;
    }
    if (other.instance.id === subject.instance.id) {
      return SolidAlgorithmIntersectionType.Intersection;
    }
    if (!SolidBoundsOps.intersects(subject.bounds, other.bounds, boundsPad)) {
      return SolidAlgorithmIntersectionType.NoIntersection;
    }
    return this.convexPolytopeTouchingRemembered(subject, other, membershipEpsilon);
  }

  /**
   * Returns the polytope touch type for a pair, reusing the stored answer when
   * both brush geometries and the epsilon are unchanged.
   *
   * @param subject Subject prepared brush.
   * @param other Other prepared brush.
   * @param epsilon Membership epsilon.
   * @returns Intersection type of the pair.
   */
  private static convexPolytopeTouchingRemembered(
    subject: PreparedBrush,
    other: PreparedBrush,
    epsilon: number,
  ): SolidAlgorithmIntersectionType {
    const remembered = this.touchTypeMemo.get(subject.brush, other.brush);
    if (
      remembered &&
      remembered.epsilon === epsilon &&
      remembered.subjectBounds === subject.bounds &&
      remembered.otherBounds === other.bounds
    ) {
      return remembered.type;
    }
    const type = this.convexPolytopeTouching(subject, other, epsilon);
    this.touchTypeMemo.set(subject.brush, other.brush, {
      epsilon,
      subjectBounds: subject.bounds,
      otherBounds: other.bounds,
      type,
    });
    return type;
  }

  /**
   * ConvexPolytopeTouching: brush0 planes vs brush1 verts first (only BInsideA
   * or continue), then brush1 planes vs brush0 verts (intersecting sides force
   * Intersection; all-negative is AInsideB). Bounds early outs reject separated
   * pairs before vertex WhichSide.
   *
   * @param subject Processed subject brush (brush0).
   * @param other Other brush (brush1).
   * @param epsilon Bounds distance epsilon.
   * @returns Intersection type.
   */
  private static convexPolytopeTouching(
    subject: PreparedBrush,
    other: PreparedBrush,
    epsilon: number,
  ): SolidAlgorithmIntersectionType {
    const otherVsSubject = this.classifyBrushAgainstPlanes(other, subject, epsilon, false);
    if (otherVsSubject === 'separated') {
      return SolidAlgorithmIntersectionType.NoIntersection;
    }
    if (otherVsSubject === 'strictlyInside') {
      return SolidAlgorithmIntersectionType.BInsideA;
    }
    const subjectVsOther = this.classifyBrushAgainstPlanes(subject, other, epsilon, true);
    if (subjectVsOther === 'separated') {
      return SolidAlgorithmIntersectionType.NoIntersection;
    }
    if (subjectVsOther === 'strictlyInside') {
      return SolidAlgorithmIntersectionType.AInsideB;
    }
    return SolidAlgorithmIntersectionType.Intersection;
  }

  /**
   * Classifies one brush against another brush's planes using bounds early outs
   * then WhichSide over every plane. When trackIntersectingSides is true
   * (second pass), any mixed/on-plane side returns straddling immediately like
   * intersectingSides2 > 0.
   *
   * @param inner Brush whose volume is tested.
   * @param outer Brush providing outward planes.
   * @param epsilon Plane epsilon.
   * @param trackIntersectingSides Whether mixed sides force straddling early.
   * @returns Separated | strictlyInside | straddling.
   */
  private static classifyBrushAgainstPlanes(
    inner: PreparedBrush,
    outer: PreparedBrush,
    epsilon: number,
    trackIntersectingSides: boolean,
  ): 'separated' | 'strictlyInside' | 'straddling' {
    let strictNegativePlaneCount = 0;
    let intersectingPlaneCount = 0;
    for (const plane of outer.brush.planes) {
      const planeResult = this.classifyBrushAgainstOnePlane(inner, plane, epsilon);
      if (planeResult === 'separated') {
        return 'separated';
      }
      if (planeResult === 'strictlyInside') {
        strictNegativePlaneCount++;
      } else {
        intersectingPlaneCount++;
        if (trackIntersectingSides) {
          return 'straddling';
        }
      }
    }
    if (strictNegativePlaneCount === outer.brush.planes.length && outer.brush.planes.length > 0) {
      return 'strictlyInside';
    }
    if (intersectingPlaneCount > 0) {
      return 'straddling';
    }
    return 'straddling';
  }

  /**
   * Classifies one brush against a single outer plane (bounds early out then
   * WhichSide).
   *
   * @param inner Brush whose volume is tested.
   * @param plane Outer plane.
   * @param epsilon Plane epsilon.
   * @returns Separated | strictlyInside | straddling for this plane.
   */
  private static classifyBrushAgainstOnePlane(
    inner: PreparedBrush,
    plane: SolidPlane,
    epsilon: number,
  ): 'separated' | 'strictlyInside' | 'straddling' {
    const boundsSide = SolidPlaneBounds.classifyFat(plane, inner.bounds, epsilon);
    if (boundsSide === SolidPlaneBoundsResult.Outside) {
      return 'separated';
    }
    if (boundsSide === SolidPlaneBoundsResult.Inside) {
      return 'strictlyInside';
    }
    const side = this.whichSide(inner, plane, epsilon);
    if (side > 0) {
      return 'separated';
    }
    if (side < 0) {
      return 'strictlyInside';
    }
    return 'straddling';
  }

  /**
   * WhichSide: -1 all strictly negative, +1 all strictly positive, 0 mixed or
   * on-plane.
   *
   * @param brush Brush whose vertices are tested.
   * @param plane Outer plane.
   * @param epsilon Distance epsilon.
   * @returns -1, 0, or +1.
   */
  private static whichSide(brush: PreparedBrush, plane: SolidPlane, epsilon: number): number {
    if (brush.brush.vertices.length === 0) {
      return 0;
    }
    this.scratchPoint.copy(brush.brush.vertices[0]!);
    const first = plane.signedDistance(this.scratchPoint);
    if (first >= epsilon) {
      return this.allVerticesPositive(brush, plane, epsilon) ? 1 : 0;
    }
    if (first <= -epsilon) {
      return this.allVerticesNegative(brush, plane, epsilon) ? -1 : 0;
    }
    return 0;
  }

  /**
   * Returns whether every vertex is strictly on the positive side of the plane.
   *
   * @param brush Brush vertices.
   * @param plane Plane.
   * @param epsilon Distance epsilon.
   * @returns True when all vertices are strictly positive.
   */
  private static allVerticesPositive(brush: PreparedBrush, plane: SolidPlane, epsilon: number): boolean {
    for (let index = 1; index < brush.brush.vertices.length; index++) {
      this.scratchPoint.copy(brush.brush.vertices[index]!);
      if (plane.signedDistance(this.scratchPoint) < epsilon) {
        return false;
      }
    }
    return true;
  }

  /**
   * Returns whether every vertex is strictly on the negative side of the plane.
   *
   * @param brush Brush vertices.
   * @param plane Plane.
   * @param epsilon Distance epsilon.
   * @returns True when all vertices are strictly negative.
   */
  private static allVerticesNegative(brush: PreparedBrush, plane: SolidPlane, epsilon: number): boolean {
    for (let index = 1; index < brush.brush.vertices.length; index++) {
      this.scratchPoint.copy(brush.brush.vertices[index]!);
      if (plane.signedDistance(this.scratchPoint) > -epsilon) {
        return false;
      }
    }
    return true;
  }
}
