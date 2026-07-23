import * as THREE from 'three';
import {
  SOLID_FAT_PLANE_EPSILON,
  SOLID_NORMAL_ALIGN_EPSILON,
  SOLID_PLANE_D_ALIGN_EPSILON
} from '../algorithm/solid_math_constants.js';

/**
 * Plane stored as unit normal and offset (ax + by + cz + d = 0).
 * Positive half-space is outside the solid for outward-facing brush planes.
 */
export class SolidPlane {
  readonly normal: THREE.Vector3;
  readonly offset: number;

  /**
   * Creates a plane from a normal and offset.
   * @param normal Plane normal (copied and normalized when finite).
   * @param offset Plane offset d in ax+by+cz+d=0 form.
   */
  constructor(normal: THREE.Vector3, offset: number) {
    this.normal = normal.clone();
    const length = this.normal.length();
    if (length > 1e-12) {
      this.normal.multiplyScalar(1 / length);
      this.offset = offset / length;
    } else {
      this.offset = offset;
    }
  }

  /**
   * Builds a plane from three non-collinear points (right-hand winding).
   * @param a First point.
   * @param b Second point.
   * @param c Third point.
   * @returns Plane with normal pointing from the triangle front.
   */
  static fromPoints(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): SolidPlane {
    const edgeAb = new THREE.Vector3().subVectors(b, a);
    const edgeAc = new THREE.Vector3().subVectors(c, a);
    const normal = new THREE.Vector3().crossVectors(edgeAb, edgeAc).normalize();
    const offset = -normal.dot(a);
    return new SolidPlane(normal, offset);
  }

  /**
   * Builds a plane from Newell's method over a polygon ring.
   * @param points Ordered polygon vertices (convex, CCW when viewed along normal).
   * @returns Best-fit plane for the polygon.
   */
  static fromPolygon(points: THREE.Vector3[]): SolidPlane {
    const normal = new THREE.Vector3();
    const count = points.length;
    for (let index = 0; index < count; index++) {
      const current = points[index];
      const next = points[(index + 1) % count];
      normal.x += (current.y - next.y) * (current.z + next.z);
      normal.y += (current.z - next.z) * (current.x + next.x);
      normal.z += (current.x - next.x) * (current.y + next.y);
    }
    normal.normalize();
    let offsetSum = 0;
    for (const point of points) {
      offsetSum -= normal.dot(point);
    }
    return new SolidPlane(normal, offsetSum / count);
  }

  /**
   * Signed distance from point to plane (positive = outside for outward normals).
   * @param point World or local point.
   * @returns Signed distance.
   */
  signedDistance(point: THREE.Vector3): number {
    return this.normal.dot(point) + this.offset;
  }

  /**
   * Returns true when the point is strictly outside the plane half-space.
   * @param point Point to test.
   * @param epsilon Optional fat-plane width.
   * @returns True if outside.
   */
  isOutside(point: THREE.Vector3, epsilon: number = SOLID_FAT_PLANE_EPSILON): boolean {
    return this.signedDistance(point) > epsilon;
  }

  /**
   * Returns true when two planes are nearly coplanar and same orientation.
   * @param other Other plane.
   * @returns True when normals and offsets match within tolerances.
   */
  isAlignedWith(other: SolidPlane): boolean {
    const normalDot = this.normal.dot(other.normal);
    if (normalDot < SOLID_NORMAL_ALIGN_EPSILON) return false;
    return Math.abs(this.offset - other.offset) <= SOLID_PLANE_D_ALIGN_EPSILON;
  }

  /**
   * Returns true when two planes are nearly coplanar and opposite orientation.
   * @param other Other plane.
   * @returns True when reverse-aligned.
   */
  isReverseAlignedWith(other: SolidPlane): boolean {
    const normalDot = this.normal.dot(other.normal);
    if (normalDot > -SOLID_NORMAL_ALIGN_EPSILON) return false;
    return Math.abs(this.offset + other.offset) <= SOLID_PLANE_D_ALIGN_EPSILON;
  }

  /**
   * Transforms the plane by an affine matrix (for brush local → model space).
   * @param matrix Transform matrix.
   * @returns Transformed plane.
   */
  applyMatrix4(matrix: THREE.Matrix4): SolidPlane {
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
    const transformedNormal = this.normal.clone().applyMatrix3(normalMatrix).normalize();
    const pointOnPlane = this.normal.clone().multiplyScalar(-this.offset);
    pointOnPlane.applyMatrix4(matrix);
    const offset = -transformedNormal.dot(pointOnPlane);
    return new SolidPlane(transformedNormal, offset);
  }

  /**
   * Clones this plane.
   * @returns Independent copy.
   */
  clone(): SolidPlane {
    return new SolidPlane(this.normal, this.offset);
  }
}
