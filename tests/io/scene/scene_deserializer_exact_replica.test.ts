import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import { SceneDeserializer } from '@/io/scene/scene_deserializer.js';
import { getFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';

/**
 * Serializes one mesh and loads it again.
 *
 * @param mesh Source mesh.
 * @param exactReplica Whether to load as an exact replica.
 * @returns Loaded mesh.
 */
function meshReload(mesh: THREE.Mesh, exactReplica: boolean): THREE.Mesh {
  const source = new THREE.Group();
  source.add(mesh);
  const world = new THREE.Group();
  new SceneDeserializer({ exactReplica }).deserialize(new SceneSerializer().serialize(source), world);
  return world.children[0] as THREE.Mesh;
}

/**
 * Builds a textured box whose stored UVs no longer match its projection.
 *
 * @returns Mesh.
 */
function meshUvEdited(): THREE.Mesh {
  const geometry = new THREE.BufferGeometry().copy(new THREE.BoxGeometry(1, 1, 1));
  const textured = meshReload(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial()), false);
  const uv = textured.geometry.getAttribute('uv') as THREE.BufferAttribute;
  uv.setX(0, 7.25);
  return textured;
}

describe('SceneDeserializer exact replicas', () => {
  it('leave a mesh without face texture maps untextured', () => {
    const plain = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial());
    expect(getFaceTextureMaps(meshReload(plain.clone(), true))).toHaveLength(0);
    expect(getFaceTextureMaps(meshReload(plain.clone(), false)).length).toBeGreaterThan(0);
  });

  it('keep stored UVs instead of re-projecting them', () => {
    const replica = meshReload(meshUvEdited(), true);
    expect((replica.geometry.getAttribute('uv') as THREE.BufferAttribute).getX(0)).toBe(7.25);
    const loaded = meshReload(meshUvEdited(), false);
    expect((loaded.geometry.getAttribute('uv') as THREE.BufferAttribute).getX(0)).not.toBe(7.25);
  });
});
