import { beforeAll, describe, expect, it } from 'vitest';
import type { StreamCollaborationIncoming } from '@/collaboration/net/stream_collaboration_receiver.js';
import { SOCKET_COLLABORATION_LIMITS_DEFAULT } from '@/collaboration/net/socket_collaboration_types.js';
import type { StreamCollaborationSender } from '@/collaboration/net/stream_collaboration_sender.js';
import {
  TEXTURES_COLLABORATION_REPEATS_PER_MEMBER,
  TexturesCollaborationSession,
} from '@/collaboration/session/session_collaboration_textures.js';
import type { SessionCollaborationTransport } from '@/collaboration/session/session_collaboration_types.js';
import { TEXTURES_COLLABORATION_INDEX_NAME } from '@/collaboration/session/index_collaboration_textures.js';
import { texturesCollaborationRevisionEncode } from '@/collaboration/session/revision_collaboration_textures.js';
import type { TextureBrowserEntry } from '@/texture/library/texture_browser_entry.js';
import { TextureLibrary } from '@/texture/library/texture_library.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import { pngHeaderCreate } from './texture_collaboration_fixture.js';

/** Texture session wired to recording fakes. */
interface TexturesHarness {
  session: TexturesCollaborationSession;
  sent: Record<string, unknown>[];
  stored: TextureBrowserEntry[];
  started: string[];
}

/**
 * Creates a texture session with a fake relay, sender and library.
 *
 * @returns Session and what it sent, stored and streamed.
 */
function texturesHarnessCreate(): TexturesHarness {
  const sent: Record<string, unknown>[] = [];
  const stored: TextureBrowserEntry[] = [];
  const started: string[] = [];
  const transport = {
    limits: SOCKET_COLLABORATION_LIMITS_DEFAULT,
    send: (message: object) => sent.push(message as Record<string, unknown>),
  } as unknown as SessionCollaborationTransport;
  const sender = {
    activeCountFor: () => 0,
    activeCount: () => 0,
    start: (_to: number, _kind: string, _bytes: Uint8Array, name: string) => started.push(name),
  } as unknown as StreamCollaborationSender;
  const library = {
    getEntryById: (id: string) => stored.find((entry) => entry.id === id) ?? null,
    entriesAppend: (entries: TextureBrowserEntry[]) => stored.push(...entries),
    getRevision: () => 0,
    getEntryCount: () => stored.length,
    getEntries: () => stored,
  } as unknown as TextureLibrary;
  return { session: new TexturesCollaborationSession(transport, sender, () => library), sent, stored, started };
}

/**
 * Builds a completed asset stream.
 *
 * @param name Texture id.
 * @param bytes File bytes.
 * @param mime Mime type the owner claims.
 * @returns Completed stream.
 */
function assetIncoming(name: string, bytes: Uint8Array, mime: string): StreamCollaborationIncoming {
  return { stream: 1, kind: 'asset', size: bytes.byteLength, name, mime, bytes, received: bytes.byteLength, parts: [] };
}

/**
 * Builds a node state that references one texture.
 *
 * @param textureId Texture id.
 * @returns Node state list.
 */
function statesWithTexture(textureId: string): Parameters<TexturesCollaborationSession['ensure']>[0] {
  return [{ data: { textureId } }] as unknown as Parameters<TexturesCollaborationSession['ensure']>[0];
}

beforeAll(() => {
  if (typeof URL.createObjectURL !== 'function') Object.assign(URL, { createObjectURL: () => 'blob:test' });
});

describe('TexturesCollaborationSession hostile owner', () => {
  it('drops textures the member never requested', () => {
    const harness = texturesHarnessCreate();
    harness.session.received(assetIncoming('pushed.png', pngHeaderCreate(4, 4), 'image/png'));
    expect(harness.stored).toEqual([]);
  });

  it('drops requested files that are not raster images and stores real images by sniffed type', () => {
    const harness = texturesHarnessCreate();
    void harness.session.ensure([...statesWithTexture('evil.png'), ...statesWithTexture('brick.png')]);
    const html = new TextEncoder().encode('<script>alert(1)</script>');
    harness.session.received(assetIncoming('evil.png', html, 'text/html'));
    harness.session.received(assetIncoming('brick.png', pngHeaderCreate(4, 4), 'text/html'));
    expect(harness.stored.map((entry) => [entry.id, entry.mimeType])).toEqual([['brick.png', 'image/png']]);
  });
});

describe('TexturesCollaborationSession names', () => {
  it("shows the owner's names for imported textures instead of their content hashes", () => {
    const harness = texturesHarnessCreate();
    const named = `embedded:${'b6a9a98b'.repeat(8)}.png`;
    const unnamed = `embedded:${'c'.repeat(64)}.png`;
    harness.session.received(
      assetIncoming(
        TEXTURES_COLLABORATION_INDEX_NAME,
        texturesCollaborationRevisionEncode(1, [named, unnamed], new Map([[named, 'cardboard.png']])),
        'application/json',
      ),
    );
    void harness.session.ensure([...statesWithTexture(named), ...statesWithTexture(unnamed)]);
    harness.session.received(assetIncoming(named, pngHeaderCreate(4, 4), 'image/png'));
    harness.session.received(assetIncoming(unnamed, pngHeaderCreate(4, 4), 'image/png'));
    expect(harness.stored.map((entry) => entry.displayName)).toEqual(['cardboard.png', 'Texture cccccccc']);
  });
});

describe('TexturesCollaborationSession arrival order', () => {
  it("lists the owner's textures by name however they stream in", () => {
    const library = new TextureLibrary();
    const transport = { limits: SOCKET_COLLABORATION_LIMITS_DEFAULT, send: () => undefined };
    const sender = { activeCountFor: () => 0, activeCount: () => 0, start: () => undefined };
    const session = new TexturesCollaborationSession(
      transport as unknown as SessionCollaborationTransport,
      sender as unknown as StreamCollaborationSender,
      () => library,
    );
    const ids = ['walls/tile10.png', 'zinc.png', 'walls/tile2.png', 'Bark.png', 'moss.png'];
    void session.ensure(ids.flatMap((id) => statesWithTexture(id)));
    for (const id of ids) session.received(assetIncoming(id, pngHeaderCreate(4, 4), 'image/png'));
    expect(library.getEntries().map((entry) => entry.id)).toEqual([
      DEFAULT_CHECKER_TEXTURE_ID,
      'Bark.png',
      'moss.png',
      'walls/tile2.png',
      'walls/tile10.png',
      'zinc.png',
    ]);
  });
});

describe('TexturesCollaborationSession hostile member', () => {
  it('serves the same texture to one member only a few times and never twice while queued', () => {
    const harness = texturesHarnessCreate();
    for (let request = 0; request < 50; request++) harness.session.serveQueue(7, 'brick.png');
    expect(harness.sent.filter((message) => message['t'] === 'asset.missing').length).toBe(
      TEXTURES_COLLABORATION_REPEATS_PER_MEMBER,
    );
    harness.session.forgetMember(7);
    harness.session.serveQueue(7, 'brick.png');
    expect(harness.sent.length).toBe(TEXTURES_COLLABORATION_REPEATS_PER_MEMBER + 1);
  });

  it('serves an embedded id from a regular project file with the same bytes', async () => {
    const harness = texturesHarnessCreate();
    const hash = 'e'.repeat(64);
    const file = new File([new Uint8Array(pngHeaderCreate(4, 4))], 'crate.png', { type: 'image/png' });
    harness.stored.push({
      id: 'props/crate.png',
      displayName: 'crate',
      fileName: 'crate.png',
      relativePath: 'props/crate.png',
      previewObjectUrl: 'blob:crate',
      mimeType: 'image/png',
      byteSize: file.size,
      sourceFile: file,
      sha256: hash,
    });
    harness.session.serveQueue(7, `embedded:${hash}.png`);
    harness.session.serveQueue(7, `embedded:${'f'.repeat(64)}.png`);
    await expect.poll(() => harness.started).toEqual([`embedded:${hash}.png`]);
    expect(
      harness.sent.filter((message) => message['t'] === 'asset.missing').map((message) => message['name']),
    ).toEqual([`embedded:${'f'.repeat(64)}.png`]);
  });
});
