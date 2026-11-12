import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierVolumeTemplateCreate } from '@/modifier/stack/modifier_volume_templates.js';
import { PaintDecalProvider } from '@/paint/decal/paint_decal_provider.js';
import { PaintSceneSystem } from '@/paint/scene/paint_scene_system.js';
import { PaintImageSourceTextures } from '@/paint/scene/paint_image_source_textures.js';
import { paintBrushKey } from '@/paint/scene/paint_brush_key.js';
import { setTextureMapCacheForTests, TextureMapCache } from '@/texture/library/texture_map_cache.js';
import { TextureLibrary } from '@/texture/library/texture_library.js';
import { createTextureBrowserEntry } from '@/texture/library/texture_browser_entry.js';
import { getDebugCheckerTexture } from '@/texture/library/factory_debug_texture.js';
import { mockObjectUrlApis } from '../../texture/library/utils_object_url_test.js';

/** Images created by the cache, loaded only when a test says so. */
const images: ImageLoadingLater[] = [];

/** Image stand-in holding 4 × 4 red pixels once loaded. */
class ImageLoadingLater {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = '';
  width = 0;
  height = 0;
  data: Uint8ClampedArray | undefined = undefined;

  constructor() {
    images.push(this);
  }

  /** Finishes loading. */
  load(): void {
    this.width = 4;
    this.height = 4;
    this.data = new Uint8ClampedArray(4 * 4 * 4).map((_value, index) => (index % 4 === 1 || index % 4 === 2 ? 0 : 255));
    this.onload?.();
  }
}

/**
 * Builds a level as it is after loading: a 4 m floor (top at y = 2) under a
 * decal volume using `decal.png`, whose file is in the library but still
 * loading.
 *
 * @returns Parts.
 */
function loadedLevel(): { system: PaintSceneSystem; model: SolidModel; sampleTop: () => number[] | null } {
  const library = new TextureLibrary();
  library.replaceAll('level', [
    createTextureBrowserEntry(new File(['x'], 'decal.png', { type: 'image/png' }), 'decal.png'),
  ]);
  const cache = new TextureMapCache();
  cache.setLibrary(library);
  setTextureMapCacheForTests(cache);
  const scene = new THREE.Scene();
  const world = new THREE.Group();
  scene.add(world);
  const model = new SolidModel('Floor');
  world.add(model.root);
  const floor = model.addBoxBrush(4, SolidOperation.Additive);
  model.rebuild(true);
  const volume = modifierVolumeTemplateCreate('decal');
  volume.position.set(0, 2, 0);
  volume.scale.set(2, 1, 2);
  const settings = ModifierVolume.read(volume);
  ModifierVolume.write(volume, {
    ...settings,
    modifiers: settings.modifiers.map((step) => ({
      ...step,
      parameters: { ...step.parameters, texture: 'decal.png', color: '#ffffff', opacity: 1, edgeFade: 0 },
    })),
  });
  world.add(volume);
  world.updateMatrixWorld(true);
  const source = new PaintImageSourceTextures();
  const system = new PaintSceneSystem(scene, () => world, source);
  system.setLayerProvider(new PaintDecalProvider(() => world, source));
  const top = floor.brush.planes.findIndex((plane) => plane.normal.y > 0.9);
  const sampleTop = (): number[] | null => {
    const out = new Float32Array(6);
    const local = new THREE.Vector3(0, 2, 0);
    return system.atlas.sampleAffine(paintBrushKey(model, floor), top, local, out) ? [...out] : null;
  };
  return { system, model, sampleTop };
}

describe('Decal textures that finish loading later', () => {
  let checkerImage: HTMLCanvasElement;
  beforeEach(() => {
    // In a browser the checker's pixels are readable; give it pixels here too.
    const checker = getDebugCheckerTexture();
    checkerImage = checker.image;
    const readable = {
      width: 2,
      height: 2,
      data: new Uint8ClampedArray([0, 0, 0, 255, 255, 0, 255, 255, 255, 0, 255, 255, 0, 0, 0, 255]),
    };
    checker.image = readable as unknown as HTMLCanvasElement;
    images.length = 0;
    vi.stubGlobal('Image', ImageLoadingLater);
    mockObjectUrlApis('blob:decal');
  });
  afterEach(() => {
    getDebugCheckerTexture().image = checkerImage;
    setTextureMapCacheForTests(null);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not hand out the checker while the file is loading', () => {
    const library = new TextureLibrary();
    library.replaceAll('level', [createTextureBrowserEntry(new File(['x'], 'a.png', { type: 'image/png' }), 'a.png')]);
    const cache = new TextureMapCache();
    cache.setLibrary(library);
    setTextureMapCacheForTests(cache);
    const source = new PaintImageSourceTextures();
    expect(source.image('a.png')).toBe(null);
    images.forEach((image) => image.load());
    expect(source.image('a.png')?.width).toBe(4);
  });

  it('shows the texture on its own once it loads, without moving the decal', () => {
    const { system, sampleTop } = loadedLevel();
    for (let frame = 0; frame < 5; frame++) system.update();
    // Nothing (in particular no checker) is baked while the file loads.
    expect(sampleTop()).toBe(null);
    images.forEach((image) => image.load());
    for (let frame = 0; frame < 2; frame++) system.update();
    const sample = sampleTop();
    expect(sample).not.toBe(null);
    // Shown color is base × A + B: the red decal replaces the surface.
    expect(sample?.slice(0, 3).map((value) => Math.round(value * 100) / 100)).toEqual([0, 0, 0]);
    expect(sample?.slice(3).map((value) => Math.round(value * 100) / 100)).toEqual([1, 0, 0]);
  });
});
