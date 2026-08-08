import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { createMeshDocumentBox } from '@/mesh/primitive/mesh_primitive_box.js';
import { meshDocumentToBufferGeometry } from '@/mesh/convert/mesh_to_buffer_geometry.js';
import { writePersistentMeshDocument, readPersistentMeshDocument } from '@/mesh/document/mesh_document_binding.js';
import {
  initializeMeshTextureUVs,
  applyTextureIdToTargets,
  buildTargetsFromMeshes,
} from '@/texture/uv/face_texture_applier.js';
import { getFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';
import { EditSession } from '@/edit/session/edit_session.js';
import { setTextureMapCacheForTests, TextureMapCache } from '@/texture/library/texture_map_cache.js';
import { readMeshDocumentFaceTextureId } from '@/mesh/convert/mesh_document_face_texture_sync.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';

/**
 * Builds a free content box mesh with persistent document and default UVs.
 *
 * @returns Content mesh ready for texture assign tests.
 */
function createTexturedContentBox(): THREE.Mesh {
  const document = createMeshDocumentBox(2, 2, 2);
  const mesh = new THREE.Mesh(meshDocumentToBufferGeometry(document));
  writePersistentMeshDocument(mesh, document);
  initializeMeshTextureUVs(mesh, DEFAULT_CHECKER_TEXTURE_ID);
  return mesh;
}

/**
 * Collects face texture ids from a mesh's faceTextureMaps.
 *
 * @param mesh Content mesh.
 * @returns Texture id list (one per map entry).
 */
function readMapTextureIds(mesh: THREE.Mesh): string[] {
  return getFaceTextureMaps(mesh).map((entry) => entry.mapping.textureId || DEFAULT_CHECKER_TEXTURE_ID);
}

/**
 * Collects per-face texture ids from a persistent mesh document.
 *
 * @param mesh Content mesh with persistent document.
 * @returns Texture id per document face.
 */
function readDocumentFaceTextureIds(mesh: THREE.Mesh): string[] {
  const document = readPersistentMeshDocument(mesh);
  if (!document) {
    return [];
  }
  const ids: string[] = [];
  const faceCount = document.getTopology().getFaceCount();
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    ids.push(readMeshDocumentFaceTextureId(document, faceIndex));
  }
  return ids;
}

describe('EditSession free-mesh texture preservation', () => {
  beforeEach(() => {
    setTextureMapCacheForTests(new TextureMapCache());
  });

  afterEach(() => {
    setTextureMapCacheForTests(null);
  });

  it('keeps an assigned texture after enter and exit', () => {
    const mesh = createTexturedContentBox();
    applyTextureIdToTargets(buildTargetsFromMeshes([mesh]), 'walls/brick.png');
    const session = new EditSession();
    session.enter([mesh]);
    expect(readMapTextureIds(mesh).every((id) => id === 'walls/brick.png')).toBe(true);
    session.exit();
    expect(readMapTextureIds(mesh).every((id) => id === 'walls/brick.png')).toBe(true);
    expect(readDocumentFaceTextureIds(mesh).every((id) => id === 'walls/brick.png')).toBe(true);
    mesh.geometry.dispose();
  });

  it('keeps a texture reassigned after a prior enter/exit baked document surfaces', () => {
    const mesh = createTexturedContentBox();
    const session = new EditSession();
    session.enter([mesh]);
    session.exit();
    applyTextureIdToTargets(buildTargetsFromMeshes([mesh]), 'walls/brick.png');
    expect(readMapTextureIds(mesh).every((id) => id === 'walls/brick.png')).toBe(true);
    expect(readDocumentFaceTextureIds(mesh).every((id) => id === 'walls/brick.png')).toBe(true);
    session.enter([mesh]);
    expect(readMapTextureIds(mesh).every((id) => id === 'walls/brick.png')).toBe(true);
    session.exit();
    expect(readMapTextureIds(mesh).every((id) => id === 'walls/brick.png')).toBe(true);
    expect(readDocumentFaceTextureIds(mesh).every((id) => id === 'walls/brick.png')).toBe(true);
    mesh.geometry.dispose();
  });

  it('updates document faces when texture is assigned without entering edit mode', () => {
    const mesh = createTexturedContentBox();
    applyTextureIdToTargets(buildTargetsFromMeshes([mesh]), 'metal/plate.png');
    expect(readDocumentFaceTextureIds(mesh).every((id) => id === 'metal/plate.png')).toBe(true);
    mesh.geometry.dispose();
  });
});
