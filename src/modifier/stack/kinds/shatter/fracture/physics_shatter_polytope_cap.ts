import * as THREE from 'three';
import type { SolidPlane } from '@/solid/brush/solid_plane.js';
import type { PhysicsShatterPolytopeFace } from './physics_shatter_polytope.js';

/** Builds the face that closes a polytope cut. */
export class PhysicsShatterPolytopeCap {
  /**
   * Orders every vertex on the cut plane into the closing face, counter-
   * clockwise seen along the plane's outward normal.
   *
   * @param faces Clipped faces.
   * @param vertices Vertex positions, crossings included.
   * @param sides Side of each original vertex; crossings lie on the plane.
   * @param plane Cut plane.
   * @returns Cap loop, or null when fewer than three points lie on the plane.
   */
  static build(
    faces: readonly PhysicsShatterPolytopeFace[],
    vertices: readonly THREE.Vector3[],
    sides: readonly number[],
    plane: SolidPlane,
  ): number[] | null {
    const onPlane = new Set<number>();
    for (const face of faces)
      for (const index of face.loop) if (index >= sides.length || sides[index] === 0) onPlane.add(index);
    if (onPlane.size < 3) return null;
    return this.sortAround([...onPlane], vertices, plane.normal);
  }

  /**
   * Sorts points of one plane by angle around their centre.
   *
   * @param indices Vertex indices on the plane.
   * @param vertices Vertex positions.
   * @param normal Outward plane normal.
   * @returns Indices counter-clockwise seen from outside.
   */
  private static sortAround(indices: number[], vertices: readonly THREE.Vector3[], normal: THREE.Vector3): number[] {
    const centre = new THREE.Vector3();
    for (const index of indices) centre.add(vertices[index] ?? centre);
    centre.multiplyScalar(1 / indices.length);
    const axisU = new THREE.Vector3(1, 0, 0);
    if (Math.abs(normal.x) > 0.9) axisU.set(0, 1, 0);
    axisU.addScaledVector(normal, -axisU.dot(normal)).normalize();
    const axisV = new THREE.Vector3().crossVectors(normal, axisU);
    const offset = new THREE.Vector3();
    const angleOf = (index: number): number => {
      offset.subVectors(vertices[index] ?? centre, centre);
      return Math.atan2(offset.dot(axisV), offset.dot(axisU));
    };
    const angles = new Map(indices.map((index) => [index, angleOf(index)]));
    return indices.sort((left, right) => (angles.get(left) ?? 0) - (angles.get(right) ?? 0));
  }
}
