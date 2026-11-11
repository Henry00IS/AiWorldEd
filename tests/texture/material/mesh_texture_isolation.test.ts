import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import {
  applyTextureIdToTargets,
  buildTargetsFromMeshes,
  initializeMeshTextureUVs,
} from '@/texture/uv/face_texture_applier.js';
import { getFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';
import { createContentMaterial } from '@/materials/factory_content_material.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import { setStateTexturePaintForTests, StateTexturePaint } from '@/texture/paint/state_texture_paint.js';
import { setTextureMapCacheForTests, TextureMapCache } from '@/texture/library/texture_map_cache.js';
import { ManagerShadingMode } from '@/viewports/shading/manager_shading_mode.js';
import { ShadingMode } from '@/types/shading_mode.js';
import { CommandHierarchyDuplicate } from '@/outliner/commands/command_hierarchy_duplicate.js';

describe('mesh texture isolation', () => {
  beforeEach(() => {
    setStateTexturePaintForTests(new StateTexturePaint());
    setTextureMapCacheForTests(new TextureMapCache());
  });

  afterEach(() => {
    setStateTexturePaintForTests(null);
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
    const manager = new ManagerShadingMode(scene);
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
    const manager = new ManagerShadingMode(scene);
    manager.snapshotMaterials();
    manager.setMode(ShadingMode.FLAT);
    expect(cubeA.material).not.toBe(cubeB.material);
  });

  it('should clone face texture maps onto duplicated meshes independently', () => {
    const source = createCube();
    initializeMeshTextureUVs(source, DEFAULT_CHECKER_TEXTURE_ID);
    applyTextureIdToTargets(buildTargetsFromMeshes([source]), 'wood.png');
    new THREE.Group().add(source);
    const command = new CommandHierarchyDuplicate([source], new THREE.Vector3(2, 0, 0));
    command.execute();
    const clone = command.getClones()[0] as THREE.Mesh;
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
 *
 * @returns Mesh ready for texture tests.
 */
function createCube(): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), createContentMaterial(0x888888));
}
