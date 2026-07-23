import * as THREE from 'three';
import { SolidPlane } from '../../solid/brush/solid_plane.js';
import { SOLID_FAT_PLANE_EPSILON } from '../../solid/algorithm/solid_math_constants.js';

/**
 * Face loop produced by half-space hull construction.
 */
export interface HalfSpaceFaceLoop {
  /** Index of the defining outward plane. */
  planeIndex: number;
  /** Ordered polygon vertices (CCW when viewed along the outward normal). */
  vertices: THREE.Vector3[];
}

/**
 * Result of building a convex polyhedron from outward half-spaces.
 */
export interface HalfSpaceHull {
  /** Unique welded vertices of the hull. */
  vertices: THREE.Vector3[];
  /** One ordered loop per contributing plane (empty planes omitted). */
  faceLoops: HalfSpaceFaceLoop[];
}

const VERTEX_WELD_EPSILON = 1e-4;
const PARALLEL_DENOM_EPSILON = 1e-10;

/**
 * Builds a convex hull by solving triple plane intersections and assembling
 * angularly sorted face polygons. This is direct half-space math — not
 * successive carving of a temporary oversized cube.
 */
export class VmfHalfSpaceHullBuilder {
  /**
   * Constructs a bounded convex polyhedron from outward SolidPlanes.
   * @param planes Outward unit planes (solid lies where signedDistance <= 0).
   * @returns Hull with welded vertices and face loops, or null if unbounded/empty.
   */
  build(planes: SolidPlane[]): HalfSpaceHull | null {
    if (planes.length < 4) return null;
    const rawVertices = this.collectValidIntersections(planes);
    if (rawVertices.length < 4) return null;
    const welded = this.weldVertices(rawVertices);
    if (welded.length < 4) return null;
    const faceLoops = this.buildFaceLoops(planes, welded);
    if (faceLoops.length < 4) return null;
    return { vertices: welded, faceLoops };
  }

  /**
   * Finds all triple-plane intersections that lie inside every half-space.
   * @param planes Outward planes.
   * @returns Candidate hull vertices (may contain near-duplicates).
   */
  private collectValidIntersections(planes: SolidPlane[]): THREE.Vector3[] {
    const points: THREE.Vector3[] = [];
    const count = planes.length;
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        for (let k = j + 1; k < count; k++) {
          const point = this.intersectThreePlanes(planes[i], planes[j], planes[k]);
          if (!point) continue;
          if (this.isInsideAllPlanes(point, planes)) {
            points.push(point);
          }
        }
      }
    }
    return points;
  }

  /**
   * Solves the intersection of three planes n·x + d = 0.
   * @param a First plane.
   * @param b Second plane.
   * @param c Third plane.
   * @returns Intersection point, or null when planes are parallel / coplanar.
   */
  private intersectThreePlanes(
    a: SolidPlane,
    b: SolidPlane,
    c: SolidPlane
  ): THREE.Vector3 | null {
    const n1 = a.normal;
    const n2 = b.normal;
    const n3 = c.normal;
    const cross23 = new THREE.Vector3().crossVectors(n2, n3);
    const denominator = n1.dot(cross23);
    if (Math.abs(denominator) < PARALLEL_DENOM_EPSILON) return null;
    const cross31 = new THREE.Vector3().crossVectors(n3, n1);
    const cross12 = new THREE.Vector3().crossVectors(n1, n2);
    const point = new THREE.Vector3();
    point.addScaledVector(cross23, -a.offset);
    point.addScaledVector(cross31, -b.offset);
    point.addScaledVector(cross12, -c.offset);
    point.multiplyScalar(1 / denominator);
    return point;
  }

  /**
   * Returns true when the point is not strictly outside any plane.
   * @param point Candidate vertex.
   * @param planes Outward planes.
   * @returns True when inside or on the convex solid.
   */
  private isInsideAllPlanes(point: THREE.Vector3, planes: SolidPlane[]): boolean {
    for (const plane of planes) {
      if (plane.signedDistance(point) > SOLID_FAT_PLANE_EPSILON) {
        return false;
      }
    }
    return true;
  }

  /**
   * Welds near-duplicate vertices into a unique list.
   * @param points Raw intersection points.
   * @returns Deduplicated vertices.
   */
  private weldVertices(points: THREE.Vector3[]): THREE.Vector3[] {
    const welded: THREE.Vector3[] = [];
    for (const point of points) {
      if (!this.findNearVertex(welded, point)) {
        welded.push(point.clone());
      }
    }
    return welded;
  }

  /**
   * Finds an existing welded vertex near the candidate.
   * @param welded Existing unique vertices.
   * @param point Candidate.
   * @returns Matching vertex or null.
   */
  private findNearVertex(
    welded: THREE.Vector3[],
    point: THREE.Vector3
  ): THREE.Vector3 | null {
    for (const existing of welded) {
      if (existing.distanceTo(point) <= VERTEX_WELD_EPSILON) {
        return existing;
      }
    }
    return null;
  }

  /**
   * Builds one ordered polygon per plane that has at least three on-plane verts.
   * @param planes Outward planes.
   * @param vertices Welded hull vertices.
   * @returns Face loops with stable plane indices.
   */
  private buildFaceLoops(
    planes: SolidPlane[],
    vertices: THREE.Vector3[]
  ): HalfSpaceFaceLoop[] {
    const loops: HalfSpaceFaceLoop[] = [];
    for (let planeIndex = 0; planeIndex < planes.length; planeIndex++) {
      const plane = planes[planeIndex];
      const onPlane = vertices.filter(
        (vertex) => Math.abs(plane.signedDistance(vertex)) <= SOLID_FAT_PLANE_EPSILON
      );
      if (onPlane.length < 3) continue;
      const ordered = this.orderPolygonOnPlane(onPlane, plane);
      if (ordered.length < 3) continue;
      loops.push({ planeIndex, vertices: ordered });
    }
    return loops;
  }

  /**
   * Orders coplanar points counter-clockwise around their centroid when
   * viewed along the outward plane normal.
   * @param points Coplanar points (at least three).
   * @param plane Face plane with outward normal.
   * @returns Ordered polygon ring.
   */
  private orderPolygonOnPlane(
    points: THREE.Vector3[],
    plane: SolidPlane
  ): THREE.Vector3[] {
    const center = this.computeCentroid(points);
    const basis = this.buildTangentBasis(plane.normal);
    const scored = points.map((point) => {
      const relative = new THREE.Vector3().subVectors(point, center);
      const angle = Math.atan2(relative.dot(basis.v), relative.dot(basis.u));
      return { point, angle };
    });
    scored.sort((left, right) => left.angle - right.angle);
    return scored.map((entry) => entry.point);
  }

  /**
   * Average of the given points.
   * @param points Point list.
   * @returns Centroid.
   */
  private computeCentroid(points: THREE.Vector3[]): THREE.Vector3 {
    const center = new THREE.Vector3();
    for (const point of points) {
      center.add(point);
    }
    return center.multiplyScalar(1 / points.length);
  }

  /**
   * Builds an orthonormal tangent frame for angular sorting on a plane.
   * @param normal Unit plane normal.
   * @returns Tangent U and bitangent V.
   */
  private buildTangentBasis(normal: THREE.Vector3): {
    u: THREE.Vector3;
    v: THREE.Vector3;
  } {
    const seed =
      Math.abs(normal.y) < 0.9
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(1, 0, 0);
    const u = new THREE.Vector3().crossVectors(seed, normal).normalize();
    const v = new THREE.Vector3().crossVectors(normal, u).normalize();
    return { u, v };
  }
}
