import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SceneJSON } from '@/io/scene/io_types.js';
import {
  SCENE_FILE_WORLD_ENTRY,
  SceneFileTooLargeError,
  sceneFileRead,
  sceneFileSizeCheck,
  sceneFileWorldText,
  sceneFileWrite,
} from '@/io/scene_file/scene_file_zip.js';
import { ZipReader } from '@/io/zip/zip_reader.js';
import { textureEmbeddedIdOf } from '@/texture/embedded/texture_embedded_id.js';
import type { TextureEmbedded } from '@/texture/embedded/texture_embedded_library.js';
import { pngHeaderCreate } from '../../collaboration/session/texture_collaboration_fixture.js';

/**
 * Builds a PNG-looking image of a given size.
 *
 * @param seed Width stored in the header (makes the bytes unique).
 * @param size Total byte count.
 * @returns Bytes.
 */
function image(seed: number, size = 64): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size);
  bytes.set(pngHeaderCreate(seed, seed));
  return bytes;
}

/**
 * Builds an embedded texture.
 *
 * @param seed Image seed.
 * @param name Readable name.
 * @param size Byte count.
 * @returns Texture.
 */
async function embedded(seed: number, name: string, size = 64): Promise<TextureEmbedded> {
  const bytes = image(seed, size);
  return { id: await textureEmbeddedIdOf(bytes, 'image/png'), name, blob: new Blob([bytes]) };
}

/**
 * Writes a level file into a Blob.
 *
 * @param scene Level.
 * @param textures Embedded textures.
 * @returns File.
 */
async function levelWrite(scene: SceneJSON, textures: readonly TextureEmbedded[]): Promise<Blob> {
  const parts: Uint8Array<ArrayBuffer>[] = [];
  await sceneFileWrite(sceneFileWorldText(scene), textures, async (chunk) => void parts.push(new Uint8Array(chunk)));
  return new Blob(parts);
}

afterEach(() => vi.restoreAllMocks());

/**
 * Makes a texture claim a size without holding the bytes.
 *
 * @param texture Texture.
 * @param size Claimed byte count.
 * @returns The texture.
 */
function sized(texture: TextureEmbedded, size: number): TextureEmbedded {
  Object.defineProperty(texture.blob, 'size', { value: size });
  return texture;
}

describe('scene file zip', () => {
  it('refuses a level larger than a zip without ZIP64 can hold before writing anything', async () => {
    const big = [sized(await embedded(4, 'a'), 3 * 2 ** 30), sized(await embedded(5, 'b'), 2 ** 30)];
    const world = sceneFileWorldText({ version: 1, objects: [] } as SceneJSON);
    expect(() => sceneFileSizeCheck(world, big)).toThrow(SceneFileTooLargeError);
    expect(() => sceneFileSizeCheck(world, big.slice(0, 1))).not.toThrow();
    const sink = vi.fn(async () => undefined);
    await expect(sceneFileWrite(world, big, sink)).rejects.toThrow(SceneFileTooLargeError);
    expect(sink).not.toHaveBeenCalled();
  });

  it('explains how to make a level that is too large smaller', () => {
    const error = new SceneFileTooLargeError();
    expect(error.message).toContain('4 GB');
    expect(error.advice).toMatch(/embedded textures/);
    expect(error.advice).toMatch(/project folder/);
    expect(error.advice).toMatch(/resolution/);
  });

  it('writes world.json plus one image and one name file per embedded texture', async () => {
    const crate = await embedded(4, 'crate');
    const scene = { version: 1, objects: [] } as SceneJSON;
    const zip = await ZipReader.open(await levelWrite(scene, [crate]));
    const hash = crate.id.slice('embedded:'.length, -'.png'.length);
    expect(zip.list().map((entry) => entry.name)).toEqual([
      SCENE_FILE_WORLD_ENTRY,
      `textures/${hash}.png`,
      `textures/${hash}.json`,
    ]);
    expect(JSON.parse(await (await zip.read(zip.entry(`textures/${hash}.json`)!)).text())).toEqual({ name: 'crate' });
  });

  it('reads back the level and its textures with names and bytes', async () => {
    const textures = [await embedded(4, 'crate'), await embedded(5, 'sign')];
    const scene = { version: 1, objects: [{ uuid: 'a', name: 'Box' }] } as unknown as SceneJSON;
    const read = await sceneFileRead(await levelWrite(scene, textures));
    expect(read.data).toEqual(scene);
    expect(read.textures.map((texture) => [texture.id, texture.name])).toEqual(
      textures.map((texture) => [texture.id, texture.name]),
    );
    expect(new Uint8Array(await read.textures[1]!.blob.arrayBuffer())).toEqual(image(5));
  });

  it('still reads plain JSON levels of older versions', async () => {
    const scene = { version: 1, objects: [] };
    expect(await sceneFileRead(new Blob([JSON.stringify(scene)]))).toEqual({ data: scene, textures: [] });
  });

  it('reads only the level and the names on load, not the images', async () => {
    const textures = await Promise.all([1, 2, 3, 4, 5].map((seed) => embedded(seed, `t${seed}`, 400_000)));
    const file = await levelWrite({ version: 1, objects: [] } as SceneJSON, textures);
    const reads = vi.spyOn(Blob.prototype, 'arrayBuffer');
    const texts = vi.spyOn(Blob.prototype, 'text');
    const read = await sceneFileRead(file);
    const sizes = [...reads.mock.contexts, ...texts.mock.contexts].map((blob) => (blob as Blob).size);
    expect(read.textures).toHaveLength(5);
    expect(file.size).toBeGreaterThan(2_000_000);
    expect(sizes.reduce((sum, size) => sum + size, 0)).toBeLessThan(80_000);
  });
});
