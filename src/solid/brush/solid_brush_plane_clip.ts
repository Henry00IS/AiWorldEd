import * as THREE from 'three';
import { ConvexPolygonClipper } from '../algorithm/convex_polygon_clipper.js';
import { SolidBrushFactory } from './solid_brush_factory.js';
import { SolidBrush } from './solid_brush.js';
import { SolidPlane } from './solid_plane.js';
import { SOLID_FAT_PLANE_EPSILON } from '../algorithm/solid_math_constants.js';

/**
 * Clips convex solid brushes by a half-space, producing a new solid brush.
 * Uses face polygon clipping plus a closing cap face (not a mesh CSG hack).
 */
export class SolidBrushPlaneClip {
  /**
   * Keeps the portion of a brush on the negative side of a plane
   * (signedDistance <= 0), which is the solid interior half-space for
   * outward-facing SolidPlanes.
   * @param brush Source convex brush in local space.
   * @param plane Outward clip plane in the same local space.
   * @returns Clipped brush, or null when the kept region is empty.
   */
  static clipKeepInside(
    brush: SolidBrush,
    plane: SolidPlane
  ): SolidBrush | null {
    const faceLoops: THREE.Vector3[][] = [];
    const capPoints: THREE.Vector3[] = [];
    for (const face of brush.faces) {
      const polygon = brush.getFaceVertices(face);
      const clipped = ConvexPolygonClipper.clipByPlane(polygon, plane).inside;
      if (clipped.length >= 3) {
        faceLoops.push(clipped);
      }
      this.collectCapEdgePoints(polygon, plane, capPoints);
    }
    const capLoop = this.buildCapLoop(capPoints, plane);
    if (capLoop && capLoop.length >= 3) {
      faceLoops.push(capLoop);
    }
    if (faceLoops.length < 4) return null;
    return SolidBrushFactory.createFromFaceLoops(faceLoops);
  }

  /**
   * Clips a brush keeping either the Three.js plane front or back half-space.
   * Three.js plane: n·x + constant = 0; front is n·x + constant >= 0.
   * @param brush Source brush in local space.
   * @param localThreePlane Plane already transformed into brush local space.
   * @param keepFront When true, keep the Three.js front half-space.
   * @returns Clipped brush, or null when empty.
   */
  static clipKeepThreeHalfSpace(
    brush: SolidBrush,
    localThreePlane: THREE.Plane,
    keepFront: boolean
  ): SolidBrush | null {
    const solidPlane = this.threePlaneToSolidKeepPlane(localThreePlane, keepFront);
    return this.clipKeepInside(brush, solidPlane);
  }

  /**
   * Builds the SolidPlane whose negative half-space is the desired keep side.
   * @param threePlane Three.js plane in brush local space.
   * @param keepFront Whether to keep the Three.js front half-space.
   * @returns SolidPlane for clipKeepInside.
   */
  private static threePlaneToSolidKeepPlane(
    threePlane: THREE.Plane,
    keepFront: boolean
  ): SolidPlane {
    const normal = threePlane.normal.clone().normalize();
    const offset = threePlane.constant;
    if (keepFront) {
      return new SolidPlane(normal.clone().negate(), -offset);
    }
    return new SolidPlane(normal, offset);
  }

  /**
   * Collects intersection points of a face ring with the clip plane.
   * @param polygon Face vertices.
   * @param plane Clip plane.
   * @param capPoints Accumulator for unique cap vertices.
   */
  private static collectCapEdgePoints(
    polygon: THREE.Vector3[],
    plane: SolidPlane,
    capPoints: THREE.Vector3[]
  ): void {
    const count = polygon.length;
    for (let index = 0; index < count; index++) {
      const current = polygon[index];
      const next = polygon[(index + 1) % count];
      const distanceA = plane.signedDistance(current);
      const distanceB = plane.signedDistance(next);
      const aInside = distanceA <= SOLID_FAT_PLANE_EPSILON;
      const bInside = distanceB <= SOLID_FAT_PLANE_EPSILON;
      if (aInside === bInside) continue;
      const denom = distanceA - distanceB;
      const t = Math.abs(denom) < 1e-20 ? 0.5 : distanceA / denom;
      const point = new THREE.Vector3().lerpVectors(current, next, t);
      this.pushUniquePoint(capPoints, point);
    }
  }

  /**
   * Adds a point when no existing cap point is near it.
   * @param points Cap point list.
   * @param point Candidate.
   */
  private static pushUniquePoint(
    points: THREE.Vector3[],
    point: THREE.Vector3
  ): void {
    for (const existing of points) {
      if (existing.distanceToSquared(point) < 1e-12) return;
    }
    points.push(point);
  }

  /**
   * Orders coplanar cap points into a convex polygon with outward winding.
   * @param points Unordered points on the clip plane.
   * @param plane Clip plane (outward for the kept solid).
   * @returns Ordered cap loop, or null when degenerate.
   */
  private static buildCapLoop(
    points: THREE.Vector3[],
    plane: SolidPlane
  ): THREE.Vector3[] | null {
    if (points.length < 3) return null;
    const center = new THREE.Vector3();
    for (const point of points) {
      center.add(point);
    }
    center.multiplyScalar(1 / points.length);
    const basis = this.buildTangentBasis(plane.normal);
    const scored = points.map((point) => {
      const relative = new THREE.Vector3().subVectors(point, center);
      const angle = Math.atan2(relative.dot(basis.v), relative.dot(basis.u));
      return { point, angle };
    });
    scored.sort((left, right) => left.angle - right.angle);
    return scored.map((entry) => entry.point.clone());
  }

  /**
   * Builds a tangent frame for angular sorting on a plane.
   * @param normal Unit plane normal.
   * @returns Orthonormal U/V axes.
   */
  private static buildTangentBasis(normal: THREE.Vector3): {
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
