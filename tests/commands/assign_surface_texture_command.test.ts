import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { AssignSurfaceTextureCommand } from '../../src/commands/assign_surface_texture_command.js';
import {
  buildTargetsFromMeshes,
  initializeMeshTextureUVs
} from '../../src/texture/face_texture_applier.js';
import {
  getFaceTextureMaps,
  setFaceTextureMaps
} from '../../src/texture/face_texture_storage.js';
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

describe('AssignSurfaceTextureCommand', () => {
  beforeEach(() => {
    setTexturePaintStateForTests(new TexturePaintState());
    setTextureMapCacheForTests(new TextureMapCache());
  });

  afterEach(() => {
    setTexturePaintStateForTests(null);
    setTextureMapCacheForTests(null);
  });

  it('should assign texture id on execute and restore on undo', () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      createContentMaterial(0x888888)
    );
    mesh.position.set(0, 0.5, 0);
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh, DEFAULT_CHECKER_TEXTURE_ID);
    const targets = buildTargetsFromMeshes([mesh]);
    const command = new AssignSurfaceTextureCommand(targets, 'walls/brick.png');
    command.execute();
    const after = getFaceTextureMaps(mesh);
    expect(after.length).toBeGreaterThan(0);
    after.forEach((entry) => {
      expect(entry.mapping.textureId).toBe('walls/brick.png');
    });
    command.undo();
    const restored = getFaceTextureMaps(mesh);
    restored.forEach((entry) => {
      expect(entry.mapping.textureId).toBe(DEFAULT_CHECKER_TEXTURE_ID);
    });
  });

  it('should preserve UV scale when only the texture id changes', () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      createContentMaterial(0x888888)
    );
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh, DEFAULT_CHECKER_TEXTURE_ID);
    const mapsBefore = getFaceTextureMaps(mesh).map((entry) => ({
      triangleIndices: entry.triangleIndices.slice(),
      mapping: { ...entry.mapping, scaleU: 2.5 }
    }));
    setFaceTextureMaps(mesh, mapsBefore);
    const targets = buildTargetsFromMeshes([mesh]);
    const command = new AssignSurfaceTextureCommand(targets, 'floor.png');
    command.execute();
    getFaceTextureMaps(mesh).forEach((entry) => {
      expect(entry.mapping.textureId).toBe('floor.png');
      expect(entry.mapping.scaleU).toBe(2.5);
    });
  });
});
