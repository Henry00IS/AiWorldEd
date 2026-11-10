import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FbxExporter } from '@/io/fbx/fbx_exporter.js';
import { ObjExporter } from '@/io/obj/obj_exporter.js';
import { createTextureBrowserEntry } from '@/texture/library/texture_browser_entry.js';
import { TextureLibrary } from '@/texture/library/texture_library.js';
import { getTextureMapCache } from '@/texture/library/texture_map_cache.js';
import { sha256Hex } from '@/utils/utils_sha256.js';
import { mockObjectUrlApis } from '../../texture/library/utils_object_url_test.js';

/** A small JPEG-looking file (magic bytes plus content). */
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 1, 2, 3, 4, 5, 0xff, 0xd9]);

/**
 * Builds a world whose box uses a library texture loaded from a JPEG file.
 *
 * @returns World group.
 */
function worldWithJpeg(): THREE.Group {
  mockObjectUrlApis('blob:original');
  const library = new TextureLibrary();
  library.entriesUpsert([
    createTextureBrowserEntry(new File([JPEG], 'wall.jpg', { type: 'image/jpeg' }), 'textures/wall.jpg'),
  ]);
  getTextureMapCache().setLibrary(library);
  const map = new THREE.DataTexture(new Uint8Array(16), 2, 2);
  map.name = 'textures/wall.jpg';
  const world = new THREE.Group();
  world.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ map })));
  return world;
}

afterEach(() => getTextureMapCache().setLibrary(null));

describe('exporters write the original texture bytes', () => {
  it('FBX: a JPG texture leaves as the same JPG', async () => {
    for (const encoding of ['binary', 'ascii'] as const) {
      const pkg = await new FbxExporter().exportPackage(worldWithJpeg(), null, 'scene', encoding, {
        mode: 'copy',
        folder: '',
      });
      expect(pkg.textures.map((texture) => texture.fileName)).toEqual(['wall.jpg']);
      const exported = new Uint8Array(await pkg.textures[0]!.blob.arrayBuffer());
      expect(await sha256Hex(exported)).toBe(await sha256Hex(JPEG));
      const document = new TextDecoder('latin1').decode(pkg.fbxBytes);
      expect(document).toContain('wall.jpg');
      expect(document).not.toContain('wall.png');
    }
  });

  it('OBJ: the .mtl names the original JPG', async () => {
    const pkg = await new ObjExporter().exportPackage(worldWithJpeg(), null, 'scene', { mode: 'copy', folder: '' });
    expect(pkg.textures.map((texture) => texture.fileName)).toEqual(['wall.jpg']);
    expect(pkg.mtl!.text).toContain('map_Kd wall.jpg');
    expect(await sha256Hex(new Uint8Array(await pkg.textures[0]!.blob.arrayBuffer()))).toBe(await sha256Hex(JPEG));
  });
});
