import * as THREE from 'three';
import { SolidPlane } from '../brush/solid_plane.js';
import { ConvexPolygonClipper } from './convex_polygon_clipper.js';

/**
 * Splits a convex surface polygon by an arrangement of planes so each
 * resulting fragment has constant solid membership against those half-spaces.
 */
export class SurfaceFragmentSplitter {
  /**
   * Splits a polygon by every provided plane into atomic fragments.
   * @param polygon Source convex polygon.
   * @param planes Planes that may cut the polygon.
   * @returns List of non-empty convex fragments.
   */
  static splitByPlanes(
    polygon: THREE.Vector3[],
    planes: SolidPlane[]
  ): THREE.Vector3[][] {
    let fragments: THREE.Vector3[][] = [polygon.map((point) => point.clone())];
    for (const plane of planes) {
      fragments = this.splitFragmentsByPlane(fragments, plane);
      if (fragments.length === 0) return [];
    }
    return fragments.filter((fragment) => fragment.length >= 3);
  }

  /**
   * Splits every fragment by a single plane into inside and outside pieces.
   * @param fragments Current fragments.
   * @param plane Clipping plane.
   * @returns Updated fragment list.
   */
  private static splitFragmentsByPlane(
    fragments: THREE.Vector3[][],
    plane: SolidPlane
  ): THREE.Vector3[][] {
    const next: THREE.Vector3[][] = [];
    for (const fragment of fragments) {
      if (!this.planeLikelyCutsPolygon(fragment, plane)) {
        next.push(fragment);
        continue;
      }
      const clipped = ConvexPolygonClipper.clipByPlane(fragment, plane);
      if (clipped.inside.length >= 3) next.push(clipped.inside);
      if (clipped.outside.length >= 3) next.push(clipped.outside);
    }
    return next;
  }

  /**
   * Quick reject when all vertices lie clearly on one side of a plane.
   * @param polygon Polygon vertices.
   * @param plane Candidate cut plane.
   * @returns True when the plane may cut the polygon.
   */
  private static planeLikelyCutsPolygon(
    polygon: THREE.Vector3[],
    plane: SolidPlane
  ): boolean {
    let sawInside = false;
    let sawOutside = false;
    for (const point of polygon) {
      const distance = plane.signedDistance(point);
      if (distance > 1e-5) sawOutside = true;
      if (distance < -1e-5) sawInside = true;
      if (sawInside && sawOutside) return true;
    }
    return false;
  }
}
