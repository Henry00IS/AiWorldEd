import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { ApplyFaceTextureCommand } from '../../src/commands/apply_face_texture_command.js';
import {
  applyTextureIdToTargets,
  buildTargetsFromMeshes,
  initializeMeshTextureUVs,
  resetUvParamsOnTargets
} from '../../src/texture/face_texture_applier.js';
import { getFaceTextureMaps } from '../../src/texture/face_texture_storage.js';
import { createContentMaterial } from '../../src/materials/content_material_factory.js';
import { createDefaultFaceTextureMapping } from '../../src/texture/face_texture_mapping.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '../../src/texture/texture_id.js';
import {
  setTexturePaintStateForTests,
  TexturePaintState
} from '../../src/texture/texture_paint_state.js';
import {
  setTextureMapCacheForTests,
  TextureMapCache
} from '../../src/texture/texture_map_cache.js';

describe('reset UV preserves texture assignment', () => {
  beforeEach(() => {
    setTexturePaintStateForTests(new TexturePaintState());
    setTextureMapCacheForTests(new TextureMapCache());
  });

  afterEach(() => {
    setTexturePaintStateForTests(null);
    setTextureMapCacheForTests(null);
  });

  it('should reset scale/offset while keeping texture id', () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      createContentMaterial(0x888888)
    );
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh, DEFAULT_CHECKER_TEXTURE_ID);
    const targets = buildTargetsFromMeshes([mesh]);
    applyTextureIdToTargets(targets, 'walls/brick.png');
    const scaled = createDefaultFaceTextureMapping('walls/brick.png');
    scaled.scaleU = 4;
    scaled.offsetV = 0.5;
    new ApplyFaceTextureCommand(targets, scaled).execute();
    expect(getFaceTextureMaps(mesh)[0].mapping.scaleU).toBe(4);
    resetUvParamsOnTargets(targets);
    const maps = getFaceTextureMaps(mesh);
    maps.forEach((entry) => {
      expect(entry.mapping.textureId).toBe('walls/brick.png');
      expect(entry.mapping.scaleU).toBe(1);
      expect(entry.mapping.offsetV).toBe(0);
      expect(entry.mapping.align).toBe('auto');
    });
  });

  it('should support undoable resetUvOnly command without clearing texture', () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      createContentMaterial(0x888888)
    );
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh, DEFAULT_CHECKER_TEXTURE_ID);
    const targets = buildTargetsFromMeshes([mesh]);
    applyTextureIdToTargets(targets, 'floor.png');
    const scaled = createDefaultFaceTextureMapping('floor.png');
    scaled.scaleU = 3;
    new ApplyFaceTextureCommand(targets, scaled).execute();
    const reset = new ApplyFaceTextureCommand(targets, createDefaultFaceTextureMapping(), {
      resetUvOnly: true
    });
    reset.execute();
    expect(getFaceTextureMaps(mesh)[0].mapping.textureId).toBe('floor.png');
    expect(getFaceTextureMaps(mesh)[0].mapping.scaleU).toBe(1);
    reset.undo();
    expect(getFaceTextureMaps(mesh)[0].mapping.textureId).toBe('floor.png');
    expect(getFaceTextureMaps(mesh)[0].mapping.scaleU).toBe(3);
  });
});
