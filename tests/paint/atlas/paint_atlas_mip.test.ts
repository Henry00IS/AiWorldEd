import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PaintAtlasPage } from '@/paint/atlas/paint_atlas_pages.js';
import {
  PAINT_ATLAS_MIP_LEVEL_MAX,
  PAINT_PAGE_SLOTS_PER_SIDE,
  PAINT_PAGE_TEXELS,
  PAINT_TILE_GUTTER_TEXELS,
  PAINT_TILE_SLOT_TEXELS,
} from '@/paint/paint_constants.js';
import { paintOverlayMaterialCreate } from '@/paint/overlay/paint_overlay_material.js';

describe('Paint atlas mipmaps', () => {
  it('sizes slots so no mip level up to the cap reads a neighbouring slot', () => {
    const block = 2 ** PAINT_ATLAS_MIP_LEVEL_MAX;
    expect(PAINT_ATLAS_MIP_LEVEL_MAX).toBeGreaterThanOrEqual(3);
    // Mip texels at the capped level never straddle two slots...
    expect(PAINT_TILE_SLOT_TEXELS % block).toBe(0);
    expect(PAINT_PAGE_TEXELS % block).toBe(0);
    // ...and a bilinear tap half a texel past the content edge stays in the gutter.
    expect(PAINT_TILE_GUTTER_TEXELS).toBeGreaterThanOrEqual(block / 2);
    expect(PAINT_PAGE_SLOTS_PER_SIDE * PAINT_TILE_SLOT_TEXELS).toBeLessThanOrEqual(PAINT_PAGE_TEXELS);
  });

  it('filters atlas pages trilinearly from GPU mipmaps', () => {
    const page = new PaintAtlasPage();
    expect(page.texture.generateMipmaps).toBe(true);
    expect(page.texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(page.texture.anisotropy).toBe(1);
    page.dispose();
  });

  it('caps the mip level in both overlay passes', () => {
    for (const pass of ['multiply', 'add'] as const) {
      const material = paintOverlayMaterialCreate(pass, new THREE.Texture());
      expect(material.fragmentShader).toContain('textureLod');
      expect(material.fragmentShader).toContain(`${PAINT_ATLAS_MIP_LEVEL_MAX.toFixed(1)}`);
      expect(material.fragmentShader).not.toContain('texture2D(atlas');
    }
  });

  it('samples at a covered point so multisampled edge pixels never read past a slot', () => {
    for (const pass of ['multiply', 'add'] as const) {
      const material = paintOverlayMaterialCreate(pass, new THREE.Texture());
      expect(material.vertexShader).toMatch(/centroid varying vec2 vUv;/);
      expect(material.fragmentShader).toMatch(/centroid varying vec2 vUv;/);
      // The mip level uses smooth (non-centroid) derivatives.
      expect(material.fragmentShader).toMatch(/dFdx\(texel\)/);
      expect(material.fragmentShader).toMatch(/vUvLod \* vec2\(textureSize/);
    }
  });
});
