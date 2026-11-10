import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FbxExporter } from '@/io/fbx/fbx_exporter.js';
import { FbxImporter } from '@/io/fbx/import/fbx_importer.js';
import type { FbxImportTexture } from '@/io/fbx/import/fbx_import_types.js';
import { ObjExporter } from '@/io/obj/obj_exporter.js';
import { GlbExporter } from '@/io/glb/glb_exporter.js';
import type { ModelExportTextures } from '@/io/export/model_export_textures.js';
import { getTextureMapCache } from '@/texture/library/texture_map_cache.js';
import type { TextureLibrary } from '@/texture/library/texture_library.js';
import { mockObjectUrlApis } from '../../texture/library/utils_object_url_test.js';

/** A 1x1 PNG, the texture's original file. */
const PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='),
  (character) => character.charCodeAt(0),
);

/**
 * Builds a world with one textured box.
 *
 * @returns World group.
 */
function texturedWorld(): THREE.Group {
  const map = new THREE.DataTexture(
    new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 9, 9, 9, 255]),
    2,
    2,
  );
  map.name = 'textures/crate.png';
  const world = new THREE.Group();
  const crate = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ map, name: 'Crate' }));
  crate.name = 'Crate';
  world.add(crate);
  return world;
}

const MODES: Record<string, ModelExportTextures> = {
  embedded: { mode: 'embedded' },
  copy: { mode: 'copy', folder: 'Textures' },
  copyBeside: { mode: 'copy', folder: '' },
  copyNested: { mode: 'copy', folder: 'Art/Maps' },
};

beforeEach(() => {
  mockObjectUrlApis();
  const library = {
    getEntryById: () => ({ sourceFile: new Blob([PNG], { type: 'image/png' }) }),
    listenerAdd: () => () => undefined,
  };
  getTextureMapCache().setLibrary(library as unknown as TextureLibrary);
});

afterEach(() => {
  getTextureMapCache().setLibrary(null);
});

describe('FBX texture paths per mode', () => {
  it('embeds the image as Video content and writes no texture file', async () => {
    const pkg = await new FbxExporter().exportPackage(texturedWorld(), null, 'level', 'binary', MODES['embedded']!);
    expect(pkg.textures).toEqual([]);
    let found: readonly FbxImportTexture[] = [];
    await new FbxImporter().importFromBytes(pkg.fbxBytes, 'level.fbx', {
      resolve: async (textures) => {
        found = textures;
        return { textureIdByImage: new Map(), note: null };
      },
    });
    expect(found).toHaveLength(1);
    expect(found[0]!.image?.bytes).toEqual(PNG);
    const ascii = await new FbxExporter().exportPackage(texturedWorld(), null, 'level', 'ascii', MODES['embedded']!);
    expect(new TextDecoder().decode(ascii.fbxBytes)).toMatch(/Content: "[A-Za-z0-9+/=]+"/);
  });

  it.each([
    ['copy', /^Textures\/[\w.-]+\.png$/],
    ['copyBeside', /^[\w.-]+\.png$/],
    ['copyNested', /^Art\/Maps\/[\w.-]+\.png$/],
  ])('%s writes the file where the model names it', async (mode, pattern) => {
    const pkg = await new FbxExporter().exportPackage(texturedWorld(), null, 'level', 'ascii', MODES[mode]!);
    expect(pkg.textures).toHaveLength(1);
    const path = pkg.textures[0]!.fileName;
    expect(path).toMatch(pattern);
    const text = new TextDecoder().decode(pkg.fbxBytes);
    expect(text).toContain(`RelativeFilename: "${path}"`);
    expect(text).not.toContain('Content:');
  });
});

describe('OBJ texture paths per mode', () => {
  it.each([
    ['copy', 'Textures/'],
    ['copyBeside', ''],
    ['copyNested', 'Art/Maps/'],
  ])('%s names the copied map from the .mtl', async (mode, prefix) => {
    const pkg = await new ObjExporter().exportPackage(texturedWorld(), null, 'level', MODES[mode]!);
    expect(pkg.textures).toHaveLength(1);
    expect(pkg.textures[0]!.fileName.startsWith(prefix)).toBe(true);
    expect(pkg.mtl?.text).toContain(`map_Kd ${pkg.textures[0]!.fileName}`);
  });

  it('leaves out the .mtl, its textures and material lines when materials are off', async () => {
    const pkg = await new ObjExporter().exportPackage(texturedWorld(), null, 'level', MODES['copy']!, false);
    expect(pkg.mtl).toBeNull();
    expect(pkg.textures).toEqual([]);
    expect(pkg.objText).not.toMatch(/^(mtllib|usemtl) /m);
    expect(pkg.objText).toMatch(/^f /m);
  });
});

describe('glTF texture paths per mode', () => {
  it('embeds images and the buffer as data URIs in one file', async () => {
    const pkg = await new GlbExporter().exportGltf(texturedWorld(), 'level', MODES['embedded']!);
    expect(pkg.fileName).toBe('level.gltf');
    expect(pkg.files).toEqual([]);
    const json = JSON.parse(pkg.text);
    expect(json.images[0].uri).toMatch(/^data:image\/png;base64,/);
    expect(json.buffers[0].uri).toMatch(/^data:application\/octet-stream;base64,/);
  });

  it.each([
    ['copy', /^Textures\/[\w.-]+\.png$/],
    ['copyBeside', /^[\w.-]+\.png$/],
  ])('%s writes the image and a .bin beside the model', async (mode, pattern) => {
    const pkg = await new GlbExporter().exportGltf(texturedWorld(), 'level', MODES[mode]!);
    const json = JSON.parse(pkg.text);
    expect(json.images[0].uri).toMatch(pattern);
    expect(json.buffers[0].uri).toBe('level.bin');
    expect(pkg.files.map((file) => file.fileName).sort()).toEqual([json.images[0].uri, 'level.bin'].sort());
  });

  it('keeps GLB images inside the binary buffer', async () => {
    const bytes = await new GlbExporter().export(texturedWorld());
    const view = new DataView(bytes);
    const jsonLength = view.getUint32(12, true);
    const json = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, jsonLength)));
    expect(json.images[0].bufferView).toBeTypeOf('number');
    expect(json.images[0].uri).toBeUndefined();
    const binStart = 20 + jsonLength + 8;
    const imageView = json.bufferViews[json.images[0].bufferView];
    expect(new Uint8Array(bytes, binStart + (imageView.byteOffset ?? 0), PNG.length)).toEqual(PNG);
  });
});
