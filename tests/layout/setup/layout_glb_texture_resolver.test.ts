import { afterEach, describe, expect, it } from 'vitest';
import { LAYOUT_ROOM_TEXTURE_NOTE, LayoutGlbTextureResolver } from '@/layout/setup/layout_glb_texture_resolver.js';
import type { GlbImportImage } from '@/io/glb/import/glb_import_types.js';
import { TextureLibrary } from '@/texture/library/texture_library.js';
import { TextureMapCache } from '@/texture/library/texture_map_cache.js';
import { textureSourceGateSet } from '@/texture/library/texture_source_gate.js';
import { sha256HexSync } from '@/utils/utils_sha256.js';
import { pngHeaderCreate } from '../../collaboration/session/texture_collaboration_fixture.js';

const IMAGES: GlbImportImage[] = [{ index: 0, name: 'wall', mimeType: 'image/png', bytes: pngHeaderCreate(8, 8) }];

/** Embedded texture id of the test image. */
const WALL_ID = `embedded:${sha256HexSync(IMAGES[0]!.bytes)}.png`;

/**
 * Builds a resolver over a texture library, without a project editor.
 *
 * @param library Texture library, or null.
 * @returns Resolver.
 */
function resolverCreate(library: TextureLibrary | null): LayoutGlbTextureResolver {
  return new LayoutGlbTextureResolver({ projectEditor: () => null, library: () => library });
}

describe('LayoutGlbTextureResolver', () => {
  afterEach(() => textureSourceGateSet(null));

  it('lists embedded images as embedded textures without a project folder', async () => {
    const library = new TextureLibrary();
    const resolution = await resolverCreate(library).resolve(IMAGES);
    expect(resolution.textureIdByImage.get(0)).toBe(WALL_ID);
    expect(resolution.note).toBe('embedded 1 new texture in the level');
    const entry = library.getEntryById(WALL_ID)!;
    expect(entry.displayName).toBe('wall');
    expect(new Uint8Array(await entry.sourceFile.arrayBuffer())).toEqual(IMAGES[0]!.bytes);
  });

  it('shares one texture for identical bytes and keeps listed entries untouched', async () => {
    const library = new TextureLibrary();
    const twice = [...IMAGES, { ...IMAGES[0]!, index: 1, name: 'copy' }];
    await resolverCreate(library).resolve(twice);
    const entry = library.getEntryById(WALL_ID);
    const revision = library.getRevision();
    const again = await resolverCreate(library).resolve(IMAGES);
    expect(again.note).toBe('reused 1 texture');
    expect(library.getEntryById(WALL_ID)).toBe(entry);
    expect(library.getRevision()).toBe(revision);
    expect(library.getEntries().filter((item) => item.id === WALL_ID)).toHaveLength(1);
  });

  it("keeps room members' embedded textures as references to the owner's embedded id, adding nothing", async () => {
    textureSourceGateSet(() => 'member');
    const library = new TextureLibrary();
    const resolution = await resolverCreate(library).resolve(IMAGES);
    expect([...resolution.textureIdByImage]).toEqual([[0, WALL_ID]]);
    expect(resolution.note).toBe(`${LAYOUT_ROOM_TEXTURE_NOTE} wall.png`);
    expect(library.getEntryById(WALL_ID)).toBeNull();
  });

  it("resolves a member's pending faces live on the owner once the owner imports the same model", async () => {
    const library = new TextureLibrary();
    textureSourceGateSet(() => 'member');
    const member = await resolverCreate(library).resolve(IMAGES);
    textureSourceGateSet(null);
    const cache = new TextureMapCache();
    cache.setLibrary(library);
    const id = member.textureIdByImage.get(0)!;
    cache.resolve(id);
    expect(cache.isPlaceholder(id)).toBe(true);
    const owner = await resolverCreate(library).resolve(IMAGES);
    expect(owner.textureIdByImage.get(0)).toBe(id);
    await expect.poll(() => cache.isPlaceholder(id)).toBe(false);
    cache.dispose();
  });

  it('keeps the checker without a texture library', async () => {
    const resolution = await resolverCreate(null).resolve(IMAGES);
    expect(resolution).toEqual({
      textureIdByImage: new Map(),
      note: 'textures kept on the checker: no texture library here',
    });
  });

  it('does nothing for files without images', async () => {
    const resolution = await resolverCreate(new TextureLibrary()).resolve([]);
    expect(resolution).toEqual({ textureIdByImage: new Map(), note: null });
  });
});
