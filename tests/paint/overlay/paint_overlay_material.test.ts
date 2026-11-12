import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { paintOverlayMaterialCreate } from '@/paint/overlay/paint_overlay_material.js';

describe('Paint overlay material', () => {
  it('samples the atlas at a covered point so multisampled edge pixels never read past a slot', () => {
    for (const pass of ['multiply', 'add'] as const) {
      const material = paintOverlayMaterialCreate(pass, new THREE.Texture());
      expect(material.vertexShader).toMatch(/centroid varying vec2 vUv;/);
      expect(material.fragmentShader).toMatch(/centroid varying vec2 vUv;/);
    }
  });
});
