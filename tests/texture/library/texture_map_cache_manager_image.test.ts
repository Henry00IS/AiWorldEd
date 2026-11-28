import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { TextureMapCache } from '@/texture/library/texture_map_cache.js';
import { TextureLibrary } from '@/texture/library/texture_library.js';
import { createTextureBrowserEntry } from '@/texture/library/texture_browser_entry.js';
import { ManagerImage, IMAGE_MANAGER_GPU_UNUSED_MS } from '@/texture/image_manager/manager_image.js';
import { setImageManagerForTests } from '@/texture/image_manager/image_manager_shared.js';
import type { ImageManagerFullImage } from '@/texture/image_manager/image_manager_types.js';
import { mockObjectUrlApis } from './utils_object_url_test.js';

/**
 * A manager whose images load at once and whose GPU sweep runs when the test
 * says.
 */
function managerCreate() {
  let clock = 0;
  const sweeps: (() => void)[] = [];
  const loads: string[] = [];
  const manager = new ManagerImage({
    now: () => clock,
    schedule: (callback) => sweeps.push(callback),
    fullLoad: (source, done) => {
      loads.push(source.name);
      done({ width: 64, height: 64, close: () => {} } as unknown as ImageManagerFullImage);
    },
    thumbnailMake: () => Promise.resolve(null),
  });
  return { manager, sweeps, loads, tick: (ms: number) => (clock += ms) };
}

describe('TextureMapCache on the image manager', () => {
  let fixture: ReturnType<typeof managerCreate>;

  beforeEach(() => {
    mockObjectUrlApis('blob:manager');
    fixture = managerCreate();
    setImageManagerForTests(fixture.manager);
  });
  afterEach(() => {
    setImageManagerForTests(null);
    vi.restoreAllMocks();
  });

  /**
   * Builds a cache over a library of the given files.
   *
   * @param names File names.
   * @returns Library and cache.
   */
  function cacheCreate(names: readonly string[]): { library: TextureLibrary; cache: TextureMapCache } {
    const library = new TextureLibrary();
    library.replaceAll(
      'root',
      names.map((name) => createTextureBrowserEntry(new File(['x'], name, { type: 'image/png' }), name)),
    );
    const cache = new TextureMapCache();
    cache.setLibrary(library);
    return { library, cache };
  }

  it('shows the full image from the manager and holds it while shown', () => {
    const { cache } = cacheCreate(['stone.png']);
    const texture = cache.resolve('stone.png');
    expect((texture.image as { width: number }).width).toBe(64);
    const row = fixture.manager.entriesInfo()[0]!;
    expect(row.name).toBe('stone.png');
    expect(row.levels.full.users).toBe(1);
    cache.forget(['stone.png']);
    expect(fixture.manager.entriesInfo()[0]!.levels.full.users).toBe(0);
  });

  it('decodes a file once for every id that shows it', () => {
    const { cache } = cacheCreate(['stone.png']);
    cache.resolve('stone.png');
    cache.resolve('textures/stone.png');
    expect(fixture.loads).toEqual(['stone.png']);
  });

  it('counts materials as GPU users and frees the texture once none is left', () => {
    const { cache } = cacheCreate(['stone.png']);
    const texture = cache.resolve('stone.png');
    const dispose = vi.spyOn(texture, 'dispose');
    const first = new THREE.MeshBasicMaterial({ map: texture });
    const second = new THREE.MeshBasicMaterial({ map: texture });
    cache.materialBind(first, texture);
    cache.materialBind(second, texture);
    const gpu = () => fixture.manager.entriesInfo()[0]!.levels.gpu;
    expect(gpu().users).toBe(1);
    expect(gpu().bytes).toBeGreaterThan(64 * 64 * 4);
    first.dispose();
    expect(gpu().users).toBe(1);
    second.dispose();
    expect(gpu().users).toBe(0);
    expect(dispose).not.toHaveBeenCalled();
    fixture.tick(IMAGE_MANAGER_GPU_UNUSED_MS);
    fixture.sweeps.shift()!();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(gpu().bytes).toBe(0);
    // The image stays: the texture uploads again if drawn.
    expect((texture.image as { width: number }).width).toBe(64);
  });

  it('moves the GPU claim along when a texture shows another file', () => {
    const { library, cache } = cacheCreate(['stone.png']);
    const texture = cache.resolve('stone.png');
    const material = new THREE.MeshBasicMaterial({ map: texture });
    cache.materialBind(material, texture);
    library.entriesUpsert([
      createTextureBrowserEntry(new File(['y'], 'stone.png', { type: 'image/png' }), 'stone.png'),
    ]);
    const rows = fixture.manager.entriesInfo();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.levels.gpu.users).toBe(1);
    expect(rows[0]!.levels.full.users).toBe(1);
    material.dispose();
  });

  it('ignores materials of textures it does not own', () => {
    const { cache } = cacheCreate([]);
    const material = new THREE.MeshBasicMaterial();
    cache.materialBind(material, new THREE.Texture());
    expect(fixture.manager.liveHandles()).toBe(0);
  });
});
