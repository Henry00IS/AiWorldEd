import { beforeAll, describe, expect, it } from 'vitest';
import type { StreamCollaborationIncoming } from '@/collaboration/net/stream_collaboration_receiver.js';
import { SOCKET_COLLABORATION_LIMITS_DEFAULT } from '@/collaboration/net/socket_collaboration_types.js';
import type { StreamCollaborationSender } from '@/collaboration/net/stream_collaboration_sender.js';
import {
  TEXTURES_COLLABORATION_REPEATS_PER_MEMBER,
  TexturesCollaborationSession,
} from '@/collaboration/session/session_collaboration_textures.js';
import type { SessionCollaborationTransport } from '@/collaboration/session/session_collaboration_types.js';
import type { TextureBrowserEntry } from '@/texture/library/texture_browser_entry.js';
import type { TextureLibrary } from '@/texture/library/texture_library.js';
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
    start: (_to: number, _kind: string, _bytes: Uint8Array, name: string) => started.push(name),
  } as unknown as StreamCollaborationSender;
  const library = {
    getEntryById: (id: string) => stored.find((entry) => entry.id === id) ?? null,
    entriesAppend: (entries: TextureBrowserEntry[]) => stored.push(...entries),
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
});
