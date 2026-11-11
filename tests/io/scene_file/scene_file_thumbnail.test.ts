import { describe, expect, it } from 'vitest';
import type { SceneJSON } from '@/io/scene/io_types.js';
import {
  SCENE_FILE_THUMBNAIL_ENTRY,
  SCENE_FILE_THUMBNAIL_SIZE_LIMIT,
  sceneFileThumbnailAccept,
  sceneFileThumbnailHeaderIs,
  sceneFileThumbnailRead,
} from '@/io/scene_file/scene_file_thumbnail.js';
import { sceneFileWorldText, sceneFileWrite } from '@/io/scene_file/scene_file_zip.js';
import { ZipReader } from '@/io/zip/zip_reader.js';

/**
 * Builds a WebP-looking image of a given size.
 *
 * @param size Total byte count.
 * @returns Bytes.
 */
function webpBytes(size = 64): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size);
  bytes.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  const riff = size - 8;
  bytes[4] = riff & 0xff;
  bytes[5] = (riff >> 8) & 0xff;
  bytes[6] = (riff >> 16) & 0xff;
  bytes[7] = (riff >> 24) & 0xff;
  return bytes;
}

/**
 * Writes a level file into a Blob.
 *
 * @param thumbnail Optional thumbnail.
 * @returns File.
 */
async function levelWrite(thumbnail: Blob | null = null): Promise<Blob> {
  const parts: Uint8Array<ArrayBuffer>[] = [];
  const world = sceneFileWorldText({ version: 1, objects: [] } as SceneJSON);
  await sceneFileWrite(world, [], async (chunk) => void parts.push(new Uint8Array(chunk)), thumbnail);
  return new Blob(parts);
}

describe('scene file thumbnail', () => {
  it('writes a stored thumbnail.webp and reads it without unpacking the level', async () => {
    const picture = new Blob([webpBytes(80)], { type: 'image/webp' });
    const file = await levelWrite(picture);
    const zip = await ZipReader.open(file);
    const entry = zip.entry(SCENE_FILE_THUMBNAIL_ENTRY);
    expect(entry?.method).toBe(0);
    expect(await (await zip.read(entry!)).arrayBuffer()).toEqual(await picture.arrayBuffer());
    const read = await sceneFileThumbnailRead(file);
    expect(read).not.toBeNull();
    expect(await read!.arrayBuffer()).toEqual(await picture.arrayBuffer());
  });

  it('omits the thumbnail when it is missing, not a WebP, or larger than the cap', async () => {
    expect(await sceneFileThumbnailRead(await levelWrite(null))).toBeNull();
    expect(await sceneFileThumbnailRead(new Blob(['{"version":1}']))).toBeNull();
    const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
    expect(await sceneFileThumbnailRead(await levelWrite(png))).toBeNull();
    const huge = new Blob([webpBytes(SCENE_FILE_THUMBNAIL_SIZE_LIMIT + 1)], { type: 'image/webp' });
    expect(await sceneFileThumbnailAccept(huge)).toBeNull();
    expect(await sceneFileThumbnailRead(await levelWrite(huge))).toBeNull();
  });

  it('recognises a WebP header', () => {
    expect(sceneFileThumbnailHeaderIs(webpBytes())).toBe(true);
    expect(sceneFileThumbnailHeaderIs(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]))).toBe(false);
    expect(sceneFileThumbnailHeaderIs(new Uint8Array(8))).toBe(false);
  });
});
