import * as THREE from 'three';
import type { SolidPlane } from '@/solid/brush/solid_plane.js';
import { SOLID_DIVIDE_MINIMUM_EPSILON } from '@/solid/algorithm/math/solid_math_constants.js';

/**
 * Triple-plane intersection matching PlaneExtensions.Intersection (float4 plane
 * form ax+by+cz+d = 0).
 */
export class SolidAlgorithmPlaneTripleIntersection {
  /**
   * Intersects three planes and returns the unique point when it exists.
   *
   * @param plane1 First plane.
   * @param plane2 Second plane.
   * @param plane3 Third plane.
   * @returns Intersection point, or null when parallel / degenerate.
   */
  static intersect(plane1: SolidPlane, plane2: SolidPlane, plane3: SolidPlane): THREE.Vector3 | null {
    return this.intersectComponents(
      plane1.normal.x,
      plane1.normal.y,
      plane1.normal.z,
      plane1.offset,
      plane2.normal.x,
      plane2.normal.y,
      plane2.normal.z,
      plane2.offset,
      plane3.normal.x,
      plane3.normal.y,
      plane3.normal.z,
      plane3.offset,
    );
  }

  /**
   * Intersects three planes given as (nx, ny, nz, d) components.
   *
   * @param a1 Plane1 nx.
   * @param b1 Plane1 ny.
   * @param c1 Plane1 nz.
   * @param d1 Plane1 d.
   * @param a2 Plane2 nx.
   * @param b2 Plane2 ny.
   * @param c2 Plane2 nz.
   * @param d2 Plane2 d.
   * @param a3 Plane3 nx.
   * @param b3 Plane3 ny.
   * @param c3 Plane3 nz.
   * @param d3 Plane3 d.
   * @returns Intersection or null.
   */
  static intersectComponents(
    a1: number,
    b1: number,
    c1: number,
    d1: number,
    a2: number,
    b2: number,
    c2: number,
    d2: number,
    a3: number,
    b3: number,
    c3: number,
    d3: number,
  ): THREE.Vector3 | null {
    // Scalar form of N0 / Nx / E (same operations and order as the vector
    // helpers below). Kept allocation-free: the object-literal version fell into
    // a V8 deopt loop ("not a Smi") when plane components mix exact integers
    // (axis-aligned normals) and doubles.
    const n0x = d2 * b3 - b2 * d3;
    const n0y = c2 * a3 - a2 * c3;
    const n0z = b2 * d3 - d2 * b3;
    const n0w = a2 * c3 - c2 * a3;
    const nxx = b2 * a3 - a2 * b3;
    const nxy = b2 * c3 - c2 * b3;
    const nxz = d2 * c3 - c2 * d3;
    const nxw = d2 * a3 - a2 * d3;
    const ex = a1 * n0x + d1 * nxx + b1 * -nxw;
    const ey = b1 * n0y + a1 * nxy + c1 * -nxx;
    const ez = c1 * n0z + b1 * nxz + d1 * -nxy;
    const ew = d1 * n0w + c1 * nxw + a1 * -nxz;
    if (!Number.isFinite(ey) || Math.abs(ey) < SOLID_DIVIDE_MINIMUM_EPSILON) {
      return null;
    }
    const x = ez / ey;
    const y = ew / ey;
    const z = ex / ey;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return null;
    }
    return new THREE.Vector3(x, y, z);
  }
}
