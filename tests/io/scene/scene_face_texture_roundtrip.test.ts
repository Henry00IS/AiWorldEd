import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import { SceneDeserializer } from '@/io/scene/scene_deserializer.js';
import { getFaceTextureMaps, setFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';
import { getTextureMapCache } from '@/texture/library/texture_map_cache.js';
import { TextureLibrary } from '@/texture/library/texture_library.js';

/**
 * Loads a mesh, saves it as JSON text and loads that text again.
 *
 * @returns Meshes after the first and second load.
 */
function meshesRoundTrip(): { first: THREE.Mesh; second: THREE.Mesh } {
  const source = new THREE.Group();
  const size = 1 + Math.random();
  source.add(new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshStandardMaterial()));
  const firstWorld = new THREE.Group();
  new SceneDeserializer().deserialize(new SceneSerializer().serialize(source), firstWorld);
  const text = JSON.stringify(new SceneSerializer().serialize(firstWorld));
  const secondWorld = new THREE.Group();
  new SceneDeserializer().deserialize(JSON.parse(text), secondWorld);
  return { first: firstWorld.children[0] as THREE.Mesh, second: secondWorld.children[0] as THREE.Mesh };
}

describe('Scene face texture maps', () => {
  it('survive saving to JSON text and loading again', () => {
    const { first, second } = meshesRoundTrip();
    const before = getFaceTextureMaps(first);
    const after = getFaceTextureMaps(second);
    expect(after.length).toBe(before.length);
    after.forEach((entry, index) => {
      expect(entry.triangleIndices).toEqual(before[index]?.triangleIndices);
      expect(JSON.stringify(entry.mapping.uv.serialize())).toBe(JSON.stringify(before[index]?.mapping.uv.serialize()));
      expect(entry.mapping.textureId).toBe(before[index]?.mapping.textureId);
    });
  });

  it('keep the path of a texture whose file is missing through saving and loading', () => {
    getTextureMapCache().setLibrary(new TextureLibrary());
    const { first } = meshesRoundTrip();
    const lost = getFaceTextureMaps(first).map((entry) => ({
      ...entry,
      mapping: { ...entry.mapping, textureId: 'walls/lost brick.png' },
    }));
    setFaceTextureMaps(first, lost);
    const world = new THREE.Group();
    world.add(first);
    const text = JSON.stringify(new SceneSerializer().serialize(world));
    const loaded = new THREE.Group();
    new SceneDeserializer().deserialize(JSON.parse(text), loaded);
    const ids = getFaceTextureMaps(loaded.children[0] as THREE.Mesh).map((entry) => entry.mapping.textureId);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids)).toEqual(new Set(['walls/lost brick.png']));
    expect(getTextureMapCache().isPlaceholder('walls/lost brick.png')).toBe(true);
    getTextureMapCache().setLibrary(null);
  });
});
