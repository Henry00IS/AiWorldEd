import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import { SceneDeserializer } from '@/io/scene/scene_deserializer.js';
import { getFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';

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
});
