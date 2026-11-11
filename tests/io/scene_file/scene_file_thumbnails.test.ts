import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SceneJSON } from '@/io/scene/io_types.js';
import { SceneFileThumbnails } from '@/io/scene_file/scene_file_thumbnails.js';
import { sceneFileWorldText, sceneFileWrite } from '@/io/scene_file/scene_file_zip.js';

/**
 * Builds a WebP-looking image.
 *
 * @returns Bytes.
 */
function webpBytes(): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(64);
  bytes.set([0x52, 0x49, 0x46, 0x46, 56, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  return bytes;
}

/**
 * Writes a level file.
 *
 * @param thumbnail Optional thumbnail.
 * @returns File.
 */
async function levelWrite(thumbnail: Blob | null): Promise<Blob> {
  const parts: Uint8Array<ArrayBuffer>[] = [];
  await sceneFileWrite(
    sceneFileWorldText({ version: 1, objects: [] } as SceneJSON),
    [],
    async (chunk) => void parts.push(new Uint8Array(chunk)),
    thumbnail,
  );
  return new Blob(parts);
}

/** Waits for pending promises. */
async function settle(): Promise<void> {
  for (let index = 0; index < 8; index++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => vi.restoreAllMocks());

describe('scene file thumbnails cache', () => {
  it('reads a level thumbnail once and returns its object URL', async () => {
    const urls: string[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      const url = `blob:thumb-${urls.length}`;
      urls.push(url);
      return url;
    });
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const file = await levelWrite(new Blob([webpBytes()], { type: 'image/webp' }));
    let ready = 0;
    const cache = new SceneFileThumbnails(() => {
      ready += 1;
    });
    expect(cache.get('maps/start.aiworld', 1, async () => file)).toBeNull();
    await settle();
    expect(ready).toBe(1);
    expect(cache.get('maps/start.aiworld', 1, async () => file)).toBe('blob:thumb-0');
    expect(urls).toEqual(['blob:thumb-0']);
    cache.get('maps/start.aiworld', 2, async () => file);
    expect(revoke).toHaveBeenCalledWith('blob:thumb-0');
  });

  it('returns null for a level with no thumbnail', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:none');
    const file = await levelWrite(null);
    let ready = 0;
    const cache = new SceneFileThumbnails(() => {
      ready += 1;
    });
    cache.get('maps/old.aiworld', 1, async () => file);
    await settle();
    expect(ready).toBe(1);
    expect(cache.get('maps/old.aiworld', 1, async () => file)).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
