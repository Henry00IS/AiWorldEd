import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  applyMappingToTargets,
  buildTargetsFromMeshes,
  initializeMeshTextureUVs,
  getCommonMapping
} from '../../src/texture/face_texture_applier.js';
import { createDefaultFaceTextureMapping } from '../../src/texture/face_texture_mapping.js';
import { getFaceTextureMaps } from '../../src/texture/face_texture_storage.js';
import { createContentMaterial } from '../../src/materials/content_material_factory.js';

describe('face_texture_applier', () => {
  it('should initialize UVs on a content mesh', () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      createContentMaterial(0x888888)
    );
    initializeMeshTextureUVs(mesh);
    expect(mesh.geometry.getAttribute('uv')).toBeDefined();
  });

  it('should build targets covering all faces of a box', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const targets = buildTargetsFromMeshes([mesh]);
    expect(targets.length).toBeGreaterThanOrEqual(6);
  });

  it('should store mappings when applying to targets', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.position.set(0, 0.5, 0);
    mesh.updateMatrixWorld(true);
    const targets = buildTargetsFromMeshes([mesh]);
    const mapping = createDefaultFaceTextureMapping();
    mapping.align = 'wall';
    mapping.scaleU = 0.5;
    applyMappingToTargets(targets, mapping);
    const maps = getFaceTextureMaps(mesh);
    expect(maps.length).toBeGreaterThan(0);
    expect(maps[0].mapping.align).toBe('wall');
  });

  it('should report a common mapping after uniform apply', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const targets = buildTargetsFromMeshes([mesh]);
    const mapping = createDefaultFaceTextureMapping();
    mapping.offsetU = 0.25;
    applyMappingToTargets(targets, mapping);
    const common = getCommonMapping(targets);
    expect(common).not.toBeNull();
    expect(common!.offsetU).toBeCloseTo(0.25, 5);
  });
});
