import { describe, expect, it } from 'vitest';
import {
  textureEmbeddedFallbackName,
  textureEmbeddedId,
  textureEmbeddedIdIs,
  textureEmbeddedIdOf,
  textureEmbeddedIdParse,
  textureEmbeddedMime,
} from '@/texture/embedded/texture_embedded_id.js';
import { sha256Hex } from '@/utils/utils_sha256.js';
import { pngHeaderCreate } from '../../collaboration/session/texture_collaboration_fixture.js';

const HASH = 'a'.repeat(64);

describe('texture embedded id', () => {
  it('names image bytes by their hash and the format their magic bytes show', async () => {
    const png = pngHeaderCreate(2, 2);
    expect(await textureEmbeddedIdOf(png, 'image/jpeg')).toBe(`embedded:${await sha256Hex(png)}.png`);
    expect(await textureEmbeddedIdOf(Uint8Array.from([1, 2, 3]), 'image/jpeg')).toMatch(/^embedded:[0-9a-f]{64}\.jpg$/);
  });

  it('parses only embedded ids, never project paths', () => {
    expect(textureEmbeddedIdParse(textureEmbeddedId(HASH, 'webp'))).toEqual({ hash: HASH, extension: 'webp' });
    expect(textureEmbeddedIdIs(`AiWorldEd/Textures/${HASH}.png`)).toBe(false);
    expect(textureEmbeddedIdIs('textures/embedded.png')).toBe(false);
    expect(textureEmbeddedMime(textureEmbeddedId(HASH, 'jpg'))).toBe('image/jpeg');
    expect(textureEmbeddedFallbackName(textureEmbeddedId(HASH, 'png'))).toBe('Texture aaaaaaaa');
  });
});
