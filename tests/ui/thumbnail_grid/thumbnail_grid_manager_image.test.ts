import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  thumbnailGridThumbCreate,
  thumbnailGridThumbSet,
  thumbnailGridTileRelease,
} from '@/ui/thumbnail_grid/thumbnail_grid.js';
import { ManagerImage } from '@/texture/image_manager/manager_image.js';
import { setImageManagerForTests } from '@/texture/image_manager/image_manager_shared.js';

describe('thumbnail grid tiles on the image manager', () => {
  let manager: ManagerImage;
  const users = (url: string): number =>
    manager.entriesInfo().find((row) => row.key === url)?.levels.thumbnail.users ?? -1;

  beforeEach(() => {
    manager = new ManagerImage({ thumbnailMake: () => new Promise(() => {}), fullLoad: () => {} });
    setImageManagerForTests(manager);
    for (const url of ['blob:a', 'blob:b'])
      manager.sourceSet({ name: url, origin: 'test', blob: new Blob([url]), url });
  });
  afterEach(() => setImageManagerForTests(null));

  it('holds the thumbnail while the tile exists and lets go when it is dropped', () => {
    const thumb = thumbnailGridThumbCreate('', 'blob:a', 'cover');
    expect(users('blob:a')).toBe(1);
    thumbnailGridThumbSet(thumb, 'blob:a');
    expect(users('blob:a')).toBe(1);
    thumbnailGridThumbSet(thumb, 'blob:b');
    expect(users('blob:a')).toBe(0);
    expect(users('blob:b')).toBe(1);
    const tile = document.createElement('div');
    tile.appendChild(thumb);
    thumbnailGridTileRelease(tile);
    expect(users('blob:b')).toBe(0);
    expect(manager.liveHandles()).toBe(0);
  });

  it('takes no handle for images the manager does not know', () => {
    thumbnailGridThumbCreate('', 'data:image/png;base64,AAAA', 'contain');
    expect(manager.liveHandles()).toBe(0);
  });
});
