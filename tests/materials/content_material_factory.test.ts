import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import {
  CONTENT_METALNESS,
  CONTENT_ROUGHNESS,
  createContentMaterial
} from '../../src/materials/content_material_factory.js';
import { disposeDebugCheckerTexture } from '../../src/texture/debug_texture_factory.js';

describe('content_material_factory', () => {
  afterEach(() => {
    disposeDebugCheckerTexture();
  });

  it('should attach the shared debug map', () => {
    const material = createContentMaterial(0xff0000);
    expect(material.map).not.toBeNull();
    expect(material.color.getHex()).toBe(0xff0000);
    material.dispose();
  });

  it('should default to flat shading', () => {
    const material = createContentMaterial(0x888888);
    expect(material.flatShading).toBe(true);
    material.dispose();
  });

  it('should use non-metallic diffuse defaults so level surfaces stay bright', () => {
    const material = createContentMaterial(0xffffff);
    expect(CONTENT_METALNESS).toBe(0);
    expect(CONTENT_ROUGHNESS).toBeGreaterThanOrEqual(0.8);
    expect(material.metalness).toBe(CONTENT_METALNESS);
    expect(material.roughness).toBe(CONTENT_ROUGHNESS);
    material.dispose();
  });
});

