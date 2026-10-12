import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { createMeshDocumentBox } from '@/mesh/primitive/mesh_primitive_box.js';
import { meshDocumentToBufferGeometry } from '@/mesh/convert/mesh_to_buffer_geometry.js';
import {
  captureMeshDocumentFaceTexturesFromDisplay,
  readMeshDocumentFaceTextureId,
  writeFaceTextureMapsFromMeshDocument,
  writeMeshDocumentFaceTextureId,
} from '@/mesh/convert/mesh_document_face_texture_sync.js';
import { writeMeshDocumentDisplayGeometry } from '@/mesh/convert/mesh_document_display_write.js';
import { setFaceTextureMaps, getFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';
import { createDefaultFaceTextureMapping } from '@/texture/uv/face_texture_mapping.js';
import { rebuildSurfaceMaterials } from '@/texture/material/builder_surface_material.js';
import { setTextureMapCacheForTests, TextureMapCache } from '@/texture/library/texture_map_cache.js';

describe('mesh_document_face_texture_sync', () => {
  beforeEach(() => {
    setTextureMapCacheForTests(new TextureMapCache());
  });

  afterEach(() => {
    setTextureMapCacheForTests(null);
  });

  it('captures multi-texture maps onto document faces after material sorting', () => {
    const document = createMeshDocumentBox(2, 2, 2);
    const mesh = new THREE.Mesh(meshDocumentToBufferGeometry(document));
    setFaceTextureMaps(mesh, [
      {
        triangleIndices: [0, 1, 2, 3],
        mapping: createDefaultFaceTextureMapping('a.png'),
      },
      {
        triangleIndices: [4, 5, 6, 7, 8, 9, 10, 11],
        mapping: createDefaultFaceTextureMapping('b.png'),
      },
    ]);
    rebuildSurfaceMaterials(mesh);
    expect(Array.isArray(mesh.material)).toBe(true);
    captureMeshDocumentFaceTexturesFromDisplay(mesh, document);
    const textureIds = new Set<string>();
    for (let faceIndex = 0; faceIndex < document.getTopology().getFaceCount(); faceIndex++) {
      textureIds.add(readMeshDocumentFaceTextureId(document, faceIndex));
    }
    expect(textureIds.has('a.png')).toBe(true);
    expect(textureIds.has('b.png')).toBe(true);
  });

  it('restores multi-material groups when rewriting display geometry', () => {
    const document = createMeshDocumentBox(2, 2, 2);
    const mesh = new THREE.Mesh(meshDocumentToBufferGeometry(document));
    setFaceTextureMaps(mesh, [
      {
        triangleIndices: [0, 1, 2, 3],
        mapping: createDefaultFaceTextureMapping('a.png'),
      },
      {
        triangleIndices: [4, 5, 6, 7, 8, 9, 10, 11],
        mapping: createDefaultFaceTextureMapping('b.png'),
      },
    ]);
    rebuildSurfaceMaterials(mesh);
    captureMeshDocumentFaceTexturesFromDisplay(mesh, document);
    writeMeshDocumentDisplayGeometry(mesh, document);
    expect(Array.isArray(mesh.material)).toBe(true);
    expect(mesh.geometry.groups.length).toBeGreaterThan(0);
    const maps = getFaceTextureMaps(mesh);
    const textureIds = new Set(maps.map((entry) => entry.mapping.textureId));
    expect(textureIds.has('a.png')).toBe(true);
    expect(textureIds.has('b.png')).toBe(true);
  });

  it('writes one face map per document face in expansion order', () => {
    const document = createMeshDocumentBox(1, 1, 1);
    for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
      writeMeshDocumentFaceTextureId(document, faceIndex, faceIndex < 2 ? 'a.png' : 'b.png');
    }
    const mesh = new THREE.Mesh(meshDocumentToBufferGeometry(document));
    writeFaceTextureMapsFromMeshDocument(mesh, document);
    const maps = getFaceTextureMaps(mesh);
    expect(maps).toHaveLength(6);
    expect(maps[0]?.triangleIndices).toEqual([0, 1]);
    expect(maps[0]?.mapping.textureId).toBe('a.png');
    expect(maps[1]?.mapping.textureId).toBe('a.png');
    expect(maps[2]?.triangleIndices).toEqual([4, 5]);
    expect(maps[2]?.mapping.textureId).toBe('b.png');
    expect(maps[5]?.mapping.textureId).toBe('b.png');
  });

  it('overwrites stale document face textures when display maps change', () => {
    const document = createMeshDocumentBox(2, 2, 2);
    for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
      writeMeshDocumentFaceTextureId(document, faceIndex, 'stale.png');
    }
    const mesh = new THREE.Mesh(meshDocumentToBufferGeometry(document));
    setFaceTextureMaps(mesh, [
      {
        triangleIndices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
        mapping: createDefaultFaceTextureMapping('fresh.png'),
      },
    ]);
    captureMeshDocumentFaceTexturesFromDisplay(mesh, document);
    for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
      expect(readMeshDocumentFaceTextureId(document, faceIndex)).toBe('fresh.png');
    }
  });
});
