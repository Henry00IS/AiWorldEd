import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import {
  applyTextureIdToTargets,
  buildTargetsFromMeshes,
  initializeMeshTextureUVs,
} from '@/texture/uv/face_texture_applier.js';
import { readContentMeshTextureId } from '@/texture/uv/content_mesh_texture.js';
import { getFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';
import { setTextureMapCacheForTests, TextureMapCache } from '@/texture/library/texture_map_cache.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import { writePersistentMeshDocument } from '@/mesh/document/mesh_document_binding.js';
import { createMeshDocumentBox } from '@/mesh/primitive/mesh_primitive_box.js';
import { meshDocumentToBufferGeometry } from '@/mesh/convert/mesh_to_buffer_geometry.js';
import { CommandTextureSurfaceAssign } from '@/texture/commands/command_texture_surface_assign.js';

describe('content mesh single texture assign', () => {
  beforeEach(() => {
    setTextureMapCacheForTests(new TextureMapCache());
  });

  afterEach(() => {
    setTextureMapCacheForTests(null);
  });

  it('assigns one texture id across all face maps without cloning triangle lists', () => {
    const document = createMeshDocumentBox(2, 2, 2);
    const mesh = new THREE.Mesh(meshDocumentToBufferGeometry(document));
    writePersistentMeshDocument(mesh, document);
    initializeMeshTextureUVs(mesh, DEFAULT_CHECKER_TEXTURE_ID);
    applyTextureIdToTargets(buildTargetsFromMeshes([mesh]), 'walls/brick.png');
    expect(readContentMeshTextureId(mesh)).toBe('walls/brick.png');
    const maps = getFaceTextureMaps(mesh);
    expect(maps.length).toBeGreaterThan(0);
    expect(maps.every((entry) => entry.mapping.textureId === 'walls/brick.png')).toBe(true);
    mesh.geometry.dispose();
  });

  it('keeps large free-mesh texture assign near-instant', () => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 96));
    initializeMeshTextureUVs(mesh, DEFAULT_CHECKER_TEXTURE_ID);
    const targets = buildTargetsFromMeshes([mesh]);
    expect(targets.length).toBe(1);
    const startMs = performance.now();
    for (let pass = 0; pass < 20; pass++) {
      applyTextureIdToTargets(targets, pass % 2 === 0 ? 'a.png' : 'b.png');
    }
    const elapsedMs = performance.now() - startMs;
    expect(elapsedMs).toBeLessThan(100);
    expect(readContentMeshTextureId(mesh)).toBe('b.png');
    mesh.geometry.dispose();
  });

  it('undo restores mesh-level texture id without UV buffer clones', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    initializeMeshTextureUVs(mesh, DEFAULT_CHECKER_TEXTURE_ID);
    const command = new CommandTextureSurfaceAssign(buildTargetsFromMeshes([mesh]), 'metal.png');
    command.execute();
    expect(readContentMeshTextureId(mesh)).toBe('metal.png');
    command.undo();
    expect(readContentMeshTextureId(mesh)).toBe(DEFAULT_CHECKER_TEXTURE_ID);
    mesh.geometry.dispose();
  });
});
