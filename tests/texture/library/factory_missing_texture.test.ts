import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { TextureMapCache } from '@/texture/library/texture_map_cache.js';
import { TextureLibrary } from '@/texture/library/texture_library.js';
import { createTextureBrowserEntry } from '@/texture/library/texture_browser_entry.js';
import { getDebugCheckerTexture } from '@/texture/library/factory_debug_texture.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import {
  getMissingCheckerImage,
  isMissingCheckerImage,
  MISSING_TEXTURE_TINT,
} from '@/texture/library/factory_missing_texture.js';
import { mockObjectUrlApis } from './utils_object_url_test.js';

/** Canvas 2D stand-in that records how the missing checker is painted. */
const painted: { composite: string[]; fills: string[] } = { composite: [], fills: [] };

/**
 * Builds a fake 2D context for jsdom canvases.
 *
 * @returns Context stand-in.
 */
function contextFake(): object {
  const context = {
    fillStyle: '',
    globalCompositeOperation: 'source-over',
    fillRect: () => {
      painted.fills.push(String(context.fillStyle));
      painted.composite.push(context.globalCompositeOperation);
    },
    drawImage: () => undefined,
  };
  return context;
}

/** Image stand-in that loads as soon as its source is set. */
class ImageLoadingImmediately {
  onload: (() => void) | null = null;
  private source = '';

  /** @returns Source URL. */
  get src(): string {
    return this.source;
  }

  /** @param value Source URL; fires the load callback. */
  set src(value: string) {
    this.source = value;
    this.onload?.();
  }
}

/**
 * Builds a library entry.
 *
 * @param id Texture id.
 * @param body File contents.
 * @returns Entry.
 */
function entryCreate(id: string, body = 'x'): ReturnType<typeof createTextureBrowserEntry> {
  return createTextureBrowserEntry(new File([body], id, { type: 'image/png' }), id);
}

describe('missing textures', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => contextFake() as unknown as CanvasRenderingContext2D,
    );
    vi.stubGlobal('Image', ImageLoadingImmediately);
    mockObjectUrlApis('blob:missing');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('multiplies the checker with pink and stays distinct from the default checker', () => {
    const image = getMissingCheckerImage();
    expect(image).not.toBe(getDebugCheckerTexture().image);
    expect(isMissingCheckerImage(image)).toBe(true);
    expect(painted.fills.at(-1)).toBe(MISSING_TEXTURE_TINT);
    expect(painted.composite.at(-1)).toBe('multiply');
  });

  it('keeps a missing id assigned, shows pink, then the file, then a replaced file live', () => {
    const library = new TextureLibrary();
    const cache = new TextureMapCache();
    cache.setLibrary(library);
    const world = new THREE.Group();
    cache.usedRootSet(world);
    const texture = cache.resolve('walls/brick.png');
    world.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ map: texture })));
    expect(isMissingCheckerImage(texture.image)).toBe(true);
    expect(cache.missingIds()).toEqual(['walls/brick.png']);
    library.replaceAll('Game', [entryCreate('walls/brick.png')]);
    const first: unknown = texture.image;
    expect(isMissingCheckerImage(first)).toBe(false);
    expect(cache.missingIds()).toEqual([]);
    library.entriesUpsert([entryCreate('walls/brick.png', 'replaced')]);
    expect(texture.image).not.toBe(first);
    expect(cache.resolve('walls/brick.png')).toBe(texture);
    library.clear();
    expect(isMissingCheckerImage(texture.image)).toBe(true);
    expect(cache.usedIds()).toEqual(['walls/brick.png']);
  });

  it('only lists ids the level still uses, never the default checker', () => {
    const cache = new TextureMapCache();
    const world = new THREE.Group();
    cache.usedRootSet(world);
    const used = cache.resolve('a.png');
    cache.resolve('deleted.png');
    const checker = cache.resolve(DEFAULT_CHECKER_TEXTURE_ID);
    world.add(new THREE.Mesh(new THREE.BoxGeometry(), [new THREE.MeshBasicMaterial({ map: used })]));
    world.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ map: checker })));
    expect(cache.usedIds()).toEqual(['a.png']);
  });
});
