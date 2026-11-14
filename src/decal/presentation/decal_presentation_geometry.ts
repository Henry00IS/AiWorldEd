import * as THREE from 'three';
import type { DecalFragment } from '@/decal/fragment/decal_fragment.js';
import type { DecalSurfaceLift } from '@/decal/surface/decal_surface_lift.js';
import type { DecalStickerFrame, DecalStickerUnfold } from '@/decal/surface/decal_sticker_unfold.js';
import type { DecalFirstHitMask } from '@/decal/occlusion/decal_first_hit_mask.js';
import type { DecalFirstHitTrim } from '@/decal/occlusion/decal_first_hit_trim.js';

/** Joined triangle arrays of every fragment of one decal. */
export interface DecalJoinedTriangles {
  /** Model-space positions. */
  positions: Float32Array;
  /** Unit normals. */
  normals: Float32Array;
  /** Image coordinates. */
  uvs: Float32Array;
  /** Projector-space positions; empty unless recorded for first hits. */
  projectorLocal: Float32Array;
}

/** Reusable helpers the geometry steps run with. */
export interface DecalGeometryTools {
  /** Lifts surface meshes off their surfaces. */
  lift: DecalSurfaceLift;
  /** First-hit height map. */
  mask: DecalFirstHitMask;
  /** Cuts away shielded parts. */
  trim: DecalFirstHitTrim;
  /** Lays images out like stickers. */
  unfold: DecalStickerUnfold;
}

/** Which steps one decal's geometry goes through. */
export interface DecalGeometryPlan {
  /** True keeps only the parts the projection meets first. */
  firstHitOnly: boolean;
  /** True unfolds the image like a sticker. */
  unfoldSticker: boolean;
  /** Lift distance in model units, or 0 to keep triangles on their surfaces. */
  liftDistance: number;
  /** Projector frame, used by unfolding. */
  frame: DecalStickerFrame;
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
    const localTotal = list.reduce((sum, fragment) => sum + fragment.projectorLocal.length, 0);
    const joined = {
      positions: new Float32Array(triangleTotal * 9),
      normals: new Float32Array(triangleTotal * 9),
      uvs: new Float32Array(triangleTotal * 6),
      projectorLocal: new Float32Array(localTotal),
    };
    let triangleStart = 0;
    for (const fragment of list) {
      joined.positions.set(fragment.positions, triangleStart * 9);
      joined.normals.set(fragment.normals, triangleStart * 9);
      joined.uvs.set(fragment.uvs, triangleStart * 6);
      if (localTotal > 0) joined.projectorLocal.set(fragment.projectorLocal, triangleStart * 9);
      triangleStart += fragment.triangleCount;
    }
    return joined;
  }

  /**
   * Runs a decal's fragments through its geometry steps: first-hit trimming,
   * sticker unfolding on the surfaces themselves, then the lift.
   *
   * @param fragments Fragments of the decal.
   * @param plan Steps to run.
   * @param tools Helpers the steps use.
   * @returns Final triangle arrays.
   */
  static arrays(
    fragments: Iterable<DecalFragment>,
    plan: DecalGeometryPlan,
    tools: DecalGeometryTools,
  ): DecalJoinedTriangles {
    const list = [...fragments];
    let joined = DecalPresentationGeometry.join(list);
    if (plan.firstHitOnly && joined.projectorLocal.length === joined.positions.length && joined.positions.length > 0) {
      tools.mask.build(list);
      joined = tools.trim.apply(joined, tools.mask);
    }
    if (joined.positions.length === 0) return joined;
    if (plan.unfoldSticker) tools.unfold.apply(joined.positions, joined.normals, joined.uvs, plan.frame);
    if (plan.liftDistance > 0) joined.positions = tools.lift.lift(joined.positions, joined.normals, plan.liftDistance);
    return joined;
  }

  /**
   * Wraps triangle arrays in a buffer geometry.
   *
   * @param joined Triangle arrays.
   * @returns New buffer geometry.
   */
  static geometryOf(joined: DecalJoinedTriangles): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(joined.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(joined.normals, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(joined.uvs, 2));
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    return geometry;
  }
}
