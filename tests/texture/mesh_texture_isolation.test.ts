import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import {
  applyTextureIdToTargets,
  buildTargetsFromMeshes,
  initializeMeshTextureUVs
} from '../../src/texture/face_texture_applier.js';
import { getFaceTextureMaps } from '../../src/texture/face_texture_storage.js';
import { createContentMaterial } from '../../src/materials/content_material_factory.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '../../src/texture/texture_id.js';
import {
  setTexturePaintStateForTests,
  TexturePaintState
} from '../../src/texture/texture_paint_state.js';
import {
  setTextureMapCacheForTests,
  TextureMapCache
} from '../../src/texture/texture_map_cache.js';
import { ShadingModeManager } from '../../src/viewports/shading_mode_manager.js';
import { ShadingMode } from '../../src/types/shading_mode.js';
import { ObjectDuplicator } from '../../src/managers/object_duplicator.js';

describe('mesh texture isolation', () => {
  beforeEach(() => {
    setTexturePaintStateForTests(new TexturePaintState());
    setTextureMapCacheForTests(new TextureMapCache());
  });

  afterEach(() => {
    setTexturePaintStateForTests(null);
    setTextureMapCacheForTests(null);
  });

  it('should not change cube B maps when assigning a texture to cube A', () => {
    const cubeA = createCube();
    const cubeB = createCube();
    initializeMeshTextureUVs(cubeA, DEFAULT_CHECKER_TEXTURE_ID);
    initializeMeshTextureUVs(cubeB, DEFAULT_CHECKER_TEXTURE_ID);
    applyTextureIdToTargets(buildTargetsFromMeshes([cubeA]), 'brick.png');
    getFaceTextureMaps(cubeA).forEach((entry) => {
      expect(entry.mapping.textureId).toBe('brick.png');
    });
    getFaceTextureMaps(cubeB).forEach((entry) => {
      expect(entry.mapping.textureId).toBe(DEFAULT_CHECKER_TEXTURE_ID);
    });
  });

  it('should keep independent materials after shading refresh in solid mode', () => {
    const scene = new THREE.Scene();
    const cubeA = createCube();
    const cubeB = createCube();
    scene.add(cubeA);
    scene.add(cubeB);
    initializeMeshTextureUVs(cubeA, DEFAULT_CHECKER_TEXTURE_ID);
    initializeMeshTextureUVs(cubeB, DEFAULT_CHECKER_TEXTURE_ID);
    const manager = new ShadingModeManager(scene);
    manager.snapshotMaterials();
    applyTextureIdToTargets(buildTargetsFromMeshes([cubeA]), 'metal.png');
    manager.snapshotMaterials();
    manager.setMode(ShadingMode.SOLID);
    getFaceTextureMaps(cubeA).forEach((entry) => {
      expect(entry.mapping.textureId).toBe('metal.png');
    });
    getFaceTextureMaps(cubeB).forEach((entry) => {
      expect(entry.mapping.textureId).toBe(DEFAULT_CHECKER_TEXTURE_ID);
    });
    const matA = cubeA.material as THREE.MeshStandardMaterial;
    const matB = cubeB.material as THREE.MeshStandardMaterial;
    expect(matA).not.toBe(matB);
  });

  it('should not share flat override materials across meshes', () => {
    const scene = new THREE.Scene();
    const cubeA = createCube();
    const cubeB = createCube();
    scene.add(cubeA);
    scene.add(cubeB);
    const manager = new ShadingModeManager(scene);
    manager.snapshotMaterials();
    manager.setMode(ShadingMode.FLAT);
    expect(cubeA.material).not.toBe(cubeB.material);
  });

  it('should clone face texture maps onto duplicated meshes independently', () => {
    const source = createCube();
    initializeMeshTextureUVs(source, DEFAULT_CHECKER_TEXTURE_ID);
    applyTextureIdToTargets(buildTargetsFromMeshes([source]), 'wood.png');
    const [clone] = ObjectDuplicator.duplicate(
      [source],
      new THREE.Vector3(2, 0, 0)
    );
    applyTextureIdToTargets(buildTargetsFromMeshes([clone]), 'stone.png');
    getFaceTextureMaps(source).forEach((entry) => {
      expect(entry.mapping.textureId).toBe('wood.png');
    });
    getFaceTextureMaps(clone).forEach((entry) => {
      expect(entry.mapping.textureId).toBe('stone.png');
    });
  });
});

/**
 * Creates a unit cube with a content material.
 * @returns Mesh ready for texture tests.
 */
function createCube(): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    createContentMaterial(0x888888)
  );
}
