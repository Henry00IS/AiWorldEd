import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FbxExporter } from '@/io/fbx/fbx_exporter.js';
import { ObjExporter } from '@/io/obj/obj_exporter.js';
import { GlbExporter } from '@/io/glb/glb_exporter.js';
import { modelExportTextureNameSanitize } from '@/io/export/model_export_texture_names.js';
import { getTextureMapCache } from '@/texture/library/texture_map_cache.js';
import type { TextureLibrary } from '@/texture/library/texture_library.js';
import { mockObjectUrlApis } from '../../texture/library/utils_object_url_test.js';

/** A 1x1 PNG, the original file of every texture. */
const PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='),
  (character) => character.charCodeAt(0),
);

/**
 * Builds an embedded texture id.
 *
 * @param letter Hex digit repeated as the hash.
 * @returns Id.
 */
function embedded(letter: string): string {
  return `embedded:${letter.repeat(64)}.png`;
}

/** Readable names of the embedded textures in the library. */
const NAMES: Record<string, string> = {
  [embedded('a')]: 'crate',
  [embedded('b')]: 'Crate',
  [embedded('c')]: 'crate_2',
  [embedded('d')]: 'a<b>:c?.png',
};

/** Texture ids in the order the boxes use them; the first is used twice. */
const IDS = [
  embedded('a'),
  embedded('b'),
  'props/crate.png',
  embedded('c'),
  embedded('d'),
  embedded('a'),
  embedded('e'),
];

/**
 * Builds a world with one box per texture id, each with its own texture object
 * and material.
 *
 * @returns World group.
 */
function world(): THREE.Group {
  const group = new THREE.Group();
  IDS.forEach((id, index) => {
    const map = new THREE.DataTexture(new Uint8Array([index, 0, 0, 255]), 1, 1);
    map.name = id;
    const material = new THREE.MeshStandardMaterial({ map, name: `Material${index}` });
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    box.name = `Box${index}`;
    box.position.x = index * 2;
    group.add(box);
  });
  group.updateMatrixWorld(true);
  return group;
}

/** File names every export writes, in order. */
const EXPECTED = ['crate', 'Crate_2', 'crate_3', 'crate_2_2', 'a_b_c', 'Texture_eeeeeeee'].map((stem) => `${stem}.png`);

beforeEach(() => {
  mockObjectUrlApis();
  const library = {
    getEntryById: (id: string) =>
      id === embedded('e')
        ? null
        : { displayName: NAMES[id] ?? id.replace(/^.*\//, ''), sourceFile: new Blob([PNG], { type: 'image/png' }) },
    listenerAdd: () => () => undefined,
  };
  getTextureMapCache().setLibrary(library as unknown as TextureLibrary);
});

afterEach(() => {
  getTextureMapCache().setLibrary(null);
});

describe('exported texture file names', () => {
  it('FBX copies use readable names, unique without regard to case, one file per texture', async () => {
    const pkg = await new FbxExporter().exportPackage(world(), null, 'level', 'binary', { mode: 'copy', folder: '' });
    expect(pkg.textures.map((texture) => texture.fileName)).toEqual(EXPECTED);
  });

  it('FBX embedded images carry the same names', async () => {
    const pkg = await new FbxExporter().exportPackage(world(), null, 'level', 'ascii', { mode: 'embedded' });
    const document = new TextDecoder('latin1').decode(pkg.fbxBytes);
    for (const name of EXPECTED) expect(document).toContain(`"${name}"`);
    expect(document).not.toContain('embedded_');
  });

  it('OBJ copies use the same names', async () => {
    const pkg = await new ObjExporter().exportPackage(world(), null, 'level', { mode: 'copy', folder: 'Textures' });
    expect(pkg.textures.map((texture) => texture.fileName)).toEqual(EXPECTED.map((name) => `Textures/${name}`));
  });

  it('glTF images and files use the same names', async () => {
    const pkg = await new GlbExporter().exportGltf(world(), 'level', { mode: 'copy', folder: '' });
    const json = JSON.parse(pkg.text) as { images: { name: string; uri: string }[] };
    expect(json.images.map((image) => image.uri)).toEqual(EXPECTED);
    expect(json.images.map((image) => image.name)).toEqual(EXPECTED.map((name) => name.replace(/\.png$/, '')));
    expect(pkg.files.map((file) => file.fileName).filter((name) => name.endsWith('.png'))).toEqual(EXPECTED);
  });
});

describe('modelExportTextureNameSanitize', () => {
  it('keeps a safe stem and avoids names Windows reserves', () => {
    expect(modelExportTextureNameSanitize('Old/Walls\\Brick Red.JPG')).toBe('Brick_Red');
    expect(modelExportTextureNameSanitize('..hidden..')).toBe('hidden');
    expect(modelExportTextureNameSanitize('con')).toBe('con_');
    expect(modelExportTextureNameSanitize('???')).toBe('');
    expect(modelExportTextureNameSanitize('x'.repeat(100))).toHaveLength(64);
  });
});
