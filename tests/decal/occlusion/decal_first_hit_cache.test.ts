import { describe, expect, it } from 'vitest';
import type { DecalFragment } from '@/decal/fragment/decal_fragment.js';
import { DecalFirstHitClip } from '@/decal/occlusion/decal_first_hit_clip.js';
import { DecalFirstHitCache } from '@/decal/occlusion/decal_first_hit_cache.js';
import { DecalPresentationGeometry } from '@/decal/presentation/decal_presentation_geometry.js';

/**
 * Builds a fragment whose model space equals projector space.
 *
 * @param triangles Projector-space triangles, nine floats each.
 * @returns Fragment.
 */
function fragmentOf(triangles: number[]): DecalFragment {
  const count = triangles.length / 9;
  const normals: number[] = [];
  const uvs: number[] = [];
  for (let corner = 0; corner < count * 3; corner++) {
    normals.push(0, 1, 0);
    uvs.push((triangles[corner * 3] ?? 0) + 0.5, (triangles[corner * 3 + 2] ?? 0) + 0.5);
  }
  return {
    positions: new Float32Array(triangles),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    triangleCount: count,
    projectorLocal: new Float32Array(triangles),
    shields: new Float32Array(0),
  };
}

/**
 * Builds a floor of two triangles, a plate above it and a small far plate.
 *
 * @param shift Offset of the plate on x.
 * @returns Fragments.
 */
function scene(shift: number): DecalFragment[] {
  const floor = fragmentOf([
    -0.5, -0.4, -0.5, -0.5, -0.4, 0.5, 0.5, -0.4, 0.5, -0.5, -0.4, -0.5, 0.5, -0.4, 0.5, 0.5, -0.4, -0.5,
  ]);
  const plate = fragmentOf([
    -0.2 + shift,
    0.1,
    -0.2,
    -0.2 + shift,
    0.1,
    0.2,
    0.2 + shift,
    0.1,
    0.2,
    -0.2 + shift,
    0.1,
    -0.2,
    0.2 + shift,
    0.1,
    0.2,
    0.2 + shift,
    0.1,
    -0.2,
  ]);
  const far = fragmentOf([0.3, 0.2, 0.3, 0.3, 0.2, 0.45, 0.45, 0.2, 0.45]);
  return [floor, plate, far];
}

/**
 * Cuts fragments with or without a cache and returns every output array.
 *
 * @param clip Clip.
 * @param fragments Fragments.
 * @param hit Hit.
 * @param cache Cache or null.
 * @returns Output arrays as plain lists.
 */
function cut(clip: DecalFirstHitClip, fragments: DecalFragment[], hit: 1 | 2, cache: DecalFirstHitCache | null) {
  const out = clip.apply(DecalPresentationGeometry.join(fragments), fragments, hit, cache);
  return [out.positions, out.normals, out.uvs, out.projectorLocal].map((array) => Array.from(array));
}

describe('DecalFirstHitCache', () => {
  it('gives the same cut as without it while occluders move between passes', () => {
    expect(cut(new DecalFirstHitClip(), scene(0), 2, null)[0]!.length).toBeGreaterThan(0);
    for (const hit of [1, 2] as const) {
      const cache = new DecalFirstHitCache();
      const cached = new DecalFirstHitClip();
      const fresh = new DecalFirstHitClip();
      for (const shift of [0, 0, 0.05, 0.05, -0.1, 0]) {
        const fragments = scene(shift);
        expect(cut(cached, fragments, hit, cache)).toEqual(cut(fresh, fragments, hit, null));
      }
    }
  });
});
