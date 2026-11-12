import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GlbImporter } from '@/io/glb/import/glb_importer.js';
import { ObjImporter } from '@/io/obj/obj_importer.js';
import { SceneDeserializer } from '@/io/scene/scene_deserializer.js';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import { getFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';
import { pngHeaderCreate } from '../../../collaboration/session/texture_collaboration_fixture.js';
import { GLB_FIXTURE_RESOLVER, glbFixtureEncode, glbFixtureQuad } from './glb_import_fixture.js';

/**
 * Saves a world as JSON text and loads it into a new world, as reopening a
 * level file does.
 *
 * @param world Source world.
 * @returns Reloaded world.
 */
function worldReopen(world: THREE.Group): THREE.Group {
  const reopened = new THREE.Group();
  const text = JSON.stringify(new SceneSerializer().serialize(world));
  new SceneDeserializer().deserialize(JSON.parse(text), reopened);
  return reopened;
}

/**
 * Lists every mesh's name with its rounded display UVs and texture ids.
 *
 * @param world World.
 * @returns Mesh name to UV and texture summary.
 */
function meshSurfaces(world: THREE.Object3D): Map<string, { uvs: number[]; textureIds: string[] }> {
  const surfaces = new Map<string, { uvs: number[]; textureIds: string[] }>();
  world.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const uvs = Array.from(
      object.geometry.getAttribute('uv').array as Float32Array,
      (value) => Math.round(value * 1000) / 1000,
    );
    const textureIds = getFaceTextureMaps(object).map((entry) => entry.mapping.textureId);
    surfaces.set(object.name, { uvs, textureIds });
  });
  return surfaces;
}

describe('imported UVs after reopening a level', () => {
  it('keep GLB texture coordinates and materials, also inside transformed groups', async () => {
    const spec = {
      nodes: [
        { name: 'Root', translation: [3.3, -1.2, 0.7], rotation: [0, 0.38268343, 0, 0.92387953], children: [1] },
        { name: 'Wall', mesh: 0, translation: [0.4, 0, 0], scale: [1.5, 1, 1] },
      ],
      meshes: [{ primitives: [{ ...glbFixtureQuad(2, 0, 0), uvs: [0.1, 0.9, 0.7, 0.9, 0.7, 0.2, 0.1, 0.2] }] }],
      materials: [{ image: 0 }],
      images: [{ name: 'wall', bytes: pngHeaderCreate(8, 8) }],
    };
    const result = await new GlbImporter().importFromBytes(glbFixtureEncode(spec), 'w.glb', GLB_FIXTURE_RESOLVER);
    const world = new THREE.Group();
    if (result !== null) world.add(result.root);
    world.updateMatrixWorld(true);
    const before = meshSurfaces(world);
    expect([...before.values()][0]?.textureIds).toEqual(['fixture/wall.png']);
    expect(meshSurfaces(worldReopen(world))).toEqual(before);
  });

  it('keep OBJ texture coordinates', () => {
    const source =
      'v 0 0 0\nv 2 0 0\nv 2 1 0\nv 0 1 0\nvt 0.25 0\nvt 0.75 0\nvt 0.75 0.5\nvt 0.25 0.5\nf 1/1 2/2 3/3 4/4\n';
    const world = new THREE.Group();
    new ObjImporter().importFromText(source, 'quad.obj').meshes.forEach((mesh) => world.add(mesh));
    world.updateMatrixWorld(true);
    const before = meshSurfaces(world);
    expect(new Set([...before.values()][0]?.uvs)).toEqual(new Set([0.25, 0.75, 0, 0.5]));
    expect(meshSurfaces(worldReopen(world))).toEqual(before);
  });
});
