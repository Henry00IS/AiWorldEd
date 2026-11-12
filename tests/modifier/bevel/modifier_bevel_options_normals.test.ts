import { modifierBevelGirderForFace } from '@/modifier/bevel/modifier_bevel_profile_cylinder.js';
import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import { SolidBrushMeshChunkBuilder } from '@/solid/mesh/solid_brush_mesh_chunk.js';
import { SurfaceCategory } from '@/solid/types/surface_category.js';
import { modifierBevelResolveDerivedSurface } from '@/modifier/bevel/modifier_bevel_stand_in.js';
import { modifierBevelStripNormalsApply } from '@/modifier/bevel/modifier_bevel_strip_normals.js';
import { modifierBevelOptionsNormalize } from '@/modifier/volume/modifier_volume_bevel_options.js';
import { bevelOptionsFixture } from './modifier_bevel_options_fixture.js';

/**
 * Strip shading may change render normals but never authored planes, positions,
 * or UVs.
 */
describe('bevel strip shading', () => {
  for (const profile of [0.375, 0.5])
    it(`smooths profile ${profile} across UV seams while preserving walls and geometry`, () => {
      const fixture = bevelOptionsFixture({ profile, normals: 'smooth' }, 8);
      const chunk = normalChunk(fixture);
      const before = chunk.normals.slice();
      const positions = chunk.positions.slice(),
        uvs = chunk.uvs.slice();
      modifierBevelStripNormalsApply(chunk, fixture.derived);
      expect(chunk.positions).toEqual(positions);
      expect(chunk.uvs).toEqual(uvs);
      expect(chunk.normals).not.toEqual(before);
      verifyNormalSeams(chunk, fixture);
      for (let vertex = 0; vertex < chunk.vertexCount; vertex++) {
        const face = chunk.triangleSources[Math.floor(vertex / 3)]?.surfaceIndex ?? -1;
        const offset = vertex * 3;
        expect(new Vector3().fromArray(chunk.normals, offset).length()).toBeCloseTo(1, 6);
        if (!fixture.derived.faces[face]?.chamferEdge)
          expect(chunk.normals.slice(offset, offset + 3)).toEqual(before.slice(offset, offset + 3));
      }
      fixture.derived.options = modifierBevelOptionsNormalize({ profile, normals: 'flat' });
      const flat = normalChunk(fixture),
        old = flat.normals.slice();
      modifierBevelStripNormalsApply(flat, fixture.derived);
      expect(flat.normals).toEqual(old);
    });
  it('does not smooth a flat chamfer even when the hidden Smooth choice was previously saved', () => {
    const fixture = bevelOptionsFixture({ profile: 0.25, normals: 'smooth' }, 8);
    const chunk = normalChunk(fixture),
      before = chunk.normals.slice();
    modifierBevelStripNormalsApply(chunk, fixture.derived);
    expect(chunk.normals).toEqual(before);
  });
});

/**
 * Builds real polygon-fan buffers with derived face provenance.
 *
 * @param fixture Derived isolated edge.
 */
function normalChunk(fixture: ReturnType<typeof bevelOptionsFixture>) {
  const brush = fixture.derived.localBrush;
  const polygons = brush.faces.map((face, index) => {
    const normal = brush.planes[index]?.normal;
    if (!normal) throw new Error('Expected face plane');
    return {
      vertices: brush.getFaceVertices(face),
      normal,
      surfaceIndex: index,
      brushId: fixture.instance.id,
      textureId: '',
      category: SurfaceCategory.Aligned,
    };
  });
  return new SolidBrushMeshChunkBuilder().build(polygons, (index) =>
    modifierBevelResolveDerivedSurface(fixture.instance, fixture.derived, index),
  );
}

/**
 * Confirms identical shading across duplicate corners and UV ownership seams.
 *
 * @param chunk Smoothed mesh buffers.
 * @param fixture Derived strip topology.
 */
function verifyNormalSeams(
  chunk: ReturnType<typeof normalChunk>,
  fixture: ReturnType<typeof bevelOptionsFixture>,
): void {
  const normals = new Map<string, Vector3>();
  for (let vertex = 0; vertex < chunk.vertexCount; vertex++) {
    const face = chunk.triangleSources[Math.floor(vertex / 3)]?.surfaceIndex ?? -1;
    const girder = modifierBevelGirderForFace(fixture.derived.localBrush, fixture.derived.girders, face);
    if (girder < 0 || !fixture.derived.faces[face]?.chamferEdge) continue;
    const point = new Vector3().fromArray(chunk.positions, vertex * 3);
    const key = `${girder}:${point
      .toArray()
      .map((value) => value.toFixed(6))
      .join(',')}`;
    const normal = new Vector3().fromArray(chunk.normals, vertex * 3);
    const previous = normals.get(key);
    if (previous) expect(normal.distanceTo(previous)).toBeLessThan(1e-6);
    normals.set(key, normal);
  }
}
