import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { rebuildSolidResultMaterials } from '@/texture/material/builder_surface_material.js';
import { SurfaceMaterialReuse } from '@/texture/material/surface_material_reuse.js';
import { createContentViewLitMaterial } from '@/materials/factory_content_view_lit_material.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import { setTextureMapCacheForTests, TextureMapCache } from '@/texture/library/texture_map_cache.js';
import { clearSharedContentMaterialStoreForTests } from '@/viewports/shared/shared_content_material_store.js';
import { disposeSharedShadingPass } from '@/viewports/shared/shared_shading_pass.js';

/**
 * Solid result material rebuilds keep previous materials that are identical to
 * freshly built ones (so shader programs are not relinked every drag frame) and
 * replace them whenever anything visible differs.
 */
describe('SurfaceMaterialReuse', () => {
  const map = new THREE.Texture();
  const otherMap = new THREE.Texture();

  it('treats an identically built material as equivalent', () => {
    const fresh = createContentViewLitMaterial(0xffffff, map, { side: THREE.FrontSide });
    const previous = createContentViewLitMaterial(0xffffff, map, { side: THREE.FrontSide });
    expect(SurfaceMaterialReuse.equivalent(previous, fresh)).toBe(true);
  });

  it('rejects a different tint, map, field or uniform value', () => {
    const fresh = createContentViewLitMaterial(0xffffff, map, { side: THREE.FrontSide });
    const tinted = createContentViewLitMaterial(0xff0000, map, { side: THREE.FrontSide });
    const remapped = createContentViewLitMaterial(0xffffff, otherMap, { side: THREE.FrontSide });
    const transparent = createContentViewLitMaterial(0xffffff, map, { side: THREE.FrontSide });
    transparent.transparent = true;
    const backSide = createContentViewLitMaterial(0xffffff, map, { side: THREE.BackSide });
    const uniformChanged = createContentViewLitMaterial(0xffffff, map, { side: THREE.FrontSide });
    const name = Object.keys(uniformChanged.uniforms).find(
      (key) => typeof uniformChanged.uniforms[key]?.value === 'number',
    );
    if (name) uniformChanged.uniforms[name] = { value: -12345 };
    for (const candidate of [tinted, remapped, transparent, backSide, uniformChanged]) {
      expect(SurfaceMaterialReuse.equivalent(candidate, fresh)).toBe(false);
    }
    expect(SurfaceMaterialReuse.equivalent(new THREE.MeshBasicMaterial(), fresh)).toBe(false);
  });

  it('matches by equivalence regardless of slot order and discards the rest', () => {
    const previousA = createContentViewLitMaterial(0xffffff, map, { side: THREE.FrontSide });
    const previousB = createContentViewLitMaterial(0xffffff, otherMap, { side: THREE.FrontSide });
    const stale = new THREE.MeshBasicMaterial();
    const freshB = createContentViewLitMaterial(0xffffff, otherMap, { side: THREE.FrontSide });
    const freshC = createContentViewLitMaterial(0xff0000, map, { side: THREE.FrontSide });
    const result = SurfaceMaterialReuse.match([freshB, freshC], [previousA, previousB, stale]);
    expect(result.materials).toEqual([previousB, freshC]);
    expect(new Set(result.discarded)).toEqual(new Set([freshB, previousA, stale]));
  });
});

describe('rebuildSolidResultMaterials material reuse', () => {
  beforeEach(() => {
    setTextureMapCacheForTests(new TextureMapCache());
    clearSharedContentMaterialStoreForTests();
    disposeSharedShadingPass();
  });

  afterEach(() => {
    disposeSharedShadingPass();
    clearSharedContentMaterialStoreForTests();
    setTextureMapCacheForTests(null);
  });

  it('keeps the same material instance across identical rebuilds without disposing it', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1).toNonIndexed(), new THREE.MeshBasicMaterial());
    const regions = [
      { triangleIndices: Array.from({ length: 12 }, (_, i) => i), textureId: DEFAULT_CHECKER_TEXTURE_ID },
    ];
    rebuildSolidResultMaterials(mesh, regions);
    const first = mesh.material as THREE.Material;
    let disposed = false;
    first.addEventListener('dispose', () => (disposed = true));
    rebuildSolidResultMaterials(mesh, regions);
    expect(mesh.material).toBe(first);
    expect(disposed).toBe(false);
  });

  it('replaces and disposes the material when the tint changes', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1).toNonIndexed(), new THREE.MeshBasicMaterial());
    const regions = [
      { triangleIndices: Array.from({ length: 12 }, (_, i) => i), textureId: DEFAULT_CHECKER_TEXTURE_ID },
    ];
    rebuildSolidResultMaterials(mesh, regions);
    const first = mesh.material as THREE.Material;
    let disposed = false;
    first.addEventListener('dispose', () => (disposed = true));
    rebuildSolidResultMaterials(mesh, regions, undefined, 0x00ff00);
    expect(mesh.material).not.toBe(first);
    expect(disposed).toBe(true);
  });
});
