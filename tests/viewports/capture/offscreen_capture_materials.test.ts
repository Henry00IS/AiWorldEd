import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { getDebugCheckerTexture } from '@/texture/library/factory_debug_texture.js';
import {
  prepareCheckerMaterialsForCapture,
  tryReplaceCheckerMapWithWhite,
} from '@/viewports/capture/offscreen_capture_materials.js';

/** Unit tests for AI capture checker → white material prep. */
describe('offscreen_capture_materials', () => {
  it('replaces the debug checker map with white and restores after capture', () => {
    const checker = getDebugCheckerTexture();
    const material = new THREE.MeshMatcapMaterial({ color: 0xff0000, map: checker });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    const scene = new THREE.Scene();
    scene.add(mesh);
    const restore = prepareCheckerMaterialsForCapture(scene);
    expect(material.map).toBeNull();
    expect(material.color.getHex()).toBe(0xffffff);
    restore();
    expect(material.map).toBe(checker);
    expect(material.color.getHex()).toBe(0xff0000);
    material.dispose();
    mesh.geometry.dispose();
  });

  it('leaves non-checker textures unchanged', () => {
    const otherMap = new THREE.Texture();
    const material = new THREE.MeshMatcapMaterial({ color: 0x00ff00, map: otherMap });
    const snapshot = tryReplaceCheckerMapWithWhite(material, getDebugCheckerTexture());
    expect(snapshot).toBeNull();
    expect(material.map).toBe(otherMap);
    expect(material.color.getHex()).toBe(0x00ff00);
    material.dispose();
    otherMap.dispose();
  });

  it('handles multi-material meshes with mixed checker and real maps', () => {
    const checker = getDebugCheckerTexture();
    const otherMap = new THREE.Texture();
    const checkerMaterial = new THREE.MeshMatcapMaterial({ color: 0x888888, map: checker });
    const texturedMaterial = new THREE.MeshMatcapMaterial({ color: 0x123456, map: otherMap });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [checkerMaterial, texturedMaterial]);
    const scene = new THREE.Scene();
    scene.add(mesh);
    const restore = prepareCheckerMaterialsForCapture(scene);
    expect(checkerMaterial.map).toBeNull();
    expect(checkerMaterial.color.getHex()).toBe(0xffffff);
    expect(texturedMaterial.map).toBe(otherMap);
    expect(texturedMaterial.color.getHex()).toBe(0x123456);
    restore();
    expect(checkerMaterial.map).toBe(checker);
    expect(checkerMaterial.color.getHex()).toBe(0x888888);
    checkerMaterial.dispose();
    texturedMaterial.dispose();
    otherMap.dispose();
    mesh.geometry.dispose();
  });
});
