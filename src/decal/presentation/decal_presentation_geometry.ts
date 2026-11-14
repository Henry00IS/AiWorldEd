import * as THREE from 'three';
import type { DecalFragment } from '@/decal/fragment/decal_fragment.js';
import type { DecalSurfaceLift } from '@/decal/surface/decal_surface_lift.js';

/** Joined triangle arrays of every fragment of one decal. */
export interface DecalJoinedTriangles {
  /** Model-space positions. */
  positions: Float32Array;
  /** Unit normals. */
  normals: Float32Array;
  /** Image coordinates. */
  uvs: Float32Array;
}

/** Joins decal fragments into the geometry a decal draws. */
export class DecalPresentationGeometry {
  /**
   * Concatenates fragments into one set of triangle arrays.
   *
   * @param fragments Fragments to join.
   * @returns Joined arrays.
   */
  static join(fragments: Iterable<DecalFragment>): DecalJoinedTriangles {
    const list = [...fragments];
    const triangleTotal = list.reduce((sum, fragment) => sum + fragment.triangleCount, 0);
    const joined = {
      positions: new Float32Array(triangleTotal * 9),
      normals: new Float32Array(triangleTotal * 9),
      uvs: new Float32Array(triangleTotal * 6),
    };
    let triangleStart = 0;
    for (const fragment of list) {
      joined.positions.set(fragment.positions, triangleStart * 9);
      joined.normals.set(fragment.normals, triangleStart * 9);
      joined.uvs.set(fragment.uvs, triangleStart * 6);
      triangleStart += fragment.triangleCount;
    }
    return joined;
  }

  /**
   * Builds the buffer geometry a decal draws, lifting it off its surfaces when
   * a lift is given.
   *
   * @param fragments Fragments of the decal.
   * @param lift Surface lift, or null to keep the triangles on their surfaces.
   * @param distance Lift distance in model units.
   * @returns New buffer geometry.
   */
  static build(
    fragments: Iterable<DecalFragment>,
    lift: DecalSurfaceLift | null,
    distance: number,
  ): THREE.BufferGeometry {
    const joined = DecalPresentationGeometry.join(fragments);
    const positions =
      lift && joined.positions.length > 0 ? lift.lift(joined.positions, joined.normals, distance) : joined.positions;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(joined.normals, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(joined.uvs, 2));
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    return geometry;
  }
}
