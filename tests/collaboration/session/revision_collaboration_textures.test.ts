import { beforeEach, describe, expect, it } from 'vitest';
import { StreamCollaborationSender } from '@/collaboration/net/stream_collaboration_sender.js';
import { SOCKET_COLLABORATION_LIMITS_DEFAULT } from '@/collaboration/net/socket_collaboration_types.js';
import {
  TEXTURES_COLLABORATION_REVISION_IDS_MAXIMUM,
  TEXTURES_COLLABORATION_REVISION_NAME,
  texturesCollaborationDigest,
  texturesCollaborationRevisionEncode,
  texturesCollaborationRevisionParse,
  texturesCollaborationStamp,
  texturesCollaborationStampSame,
} from '@/collaboration/session/revision_collaboration_textures.js';
import { TexturesCollaborationSession } from '@/collaboration/session/session_collaboration_textures.js';
import type { SessionCollaborationTransport } from '@/collaboration/session/session_collaboration_types.js';
import { createTextureBrowserEntry } from '@/texture/library/texture_browser_entry.js';
import { TextureLibrary } from '@/texture/library/texture_library.js';
import { textureSourceBlocked, textureSourceGateSet } from '@/texture/library/texture_source_gate.js';
import { ensureObjectUrlApis } from '../../texture/library/utils_object_url_test.js';
import { pngHeaderCreate } from './texture_collaboration_fixture.js';

/**
 * Encodes JSON text as a notice payload.
 *
 * @param value Value.
 * @returns Bytes.
 */
function json(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

/**
 * Builds a library entry holding PNG-headed bytes.
 *
 * @param id Texture id.
 * @returns Entry.
 */
function entryCreate(id: string): ReturnType<typeof createTextureBrowserEntry> {
  return createTextureBrowserEntry(new File([new Uint8Array(pngHeaderCreate(4, 4))], id, { type: 'image/png' }), id);
}

beforeEach(() => {
  ensureObjectUrlApis();
  textureSourceGateSet(null);
});

describe('texture revision notices', () => {
  it('round-trips and rejects stale generations', () => {
    const bytes = texturesCollaborationRevisionEncode(3, ['a.png', 'b.png']);
    expect(texturesCollaborationRevisionParse(bytes, 0)).toEqual({ generation: 3, ids: new Set(['a.png', 'b.png']) });
    expect(texturesCollaborationRevisionParse(bytes, 3)).toBeNull();
    expect(texturesCollaborationRevisionParse(bytes, 9)).toBeNull();
  });

  it('rejects hostile notices', () => {
    const many = Array.from({ length: TEXTURES_COLLABORATION_REVISION_IDS_MAXIMUM + 1 }, (_, index) => `${index}`);
    const hostile = [
      json({ v: 2, g: 1, ids: [] }),
      json({ v: 1, g: 1.5, ids: [] }),
      json({ v: 1, g: Number.MAX_SAFE_INTEGER + 2, ids: [] }),
      json({ v: 1, g: 1, ids: 'a.png' }),
      json({ v: 1, g: 1, ids: [1] }),
      json({ v: 1, g: 1, ids: [''] }),
      json({ v: 1, g: 1, ids: ['x'.repeat(513)] }),
      json({ v: 1, g: 1, ids: many }),
      json([1]),
      new Uint8Array([0xff, 0xfe, 0x7b]),
      new TextEncoder().encode('{"v":1,'),
    ];
    hostile.forEach((bytes) => expect(texturesCollaborationRevisionParse(bytes, 0)).toBeNull());
  });

  it('ignores __proto__ keys', () => {
    const notice = texturesCollaborationRevisionParse(
      new TextEncoder().encode('{"__proto__":{"polluted":1},"v":1,"g":1,"ids":["a"]}'),
      0,
    );
    expect(notice?.ids).toEqual(new Set(['a']));
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('tags different content differently and equal content equally', async () => {
    const a = await texturesCollaborationDigest(new Uint8Array([1, 2, 3]).buffer);
    const b = await texturesCollaborationDigest(new Uint8Array([1, 2, 4]).buffer);
    expect(a).not.toBe(b);
    expect(await texturesCollaborationDigest(new Uint8Array([1, 2, 3]).buffer)).toBe(a);
  });
});

describe('texture library revisions', () => {
  it('changes the stamp when a folder is opened again, even with the same files', () => {
    const library = new TextureLibrary();
    const before = texturesCollaborationStamp(library);
    library.replaceAll('same', [entryCreate('a.png')]);
    expect(texturesCollaborationStampSame(before, texturesCollaborationStamp(library))).toBe(false);
    const loaded = texturesCollaborationStamp(library);
    library.replaceAll('same', [entryCreate('a.png')]);
    expect(texturesCollaborationStampSame(loaded, texturesCollaborationStamp(library))).toBe(false);
  });

  it('removes entries and falls back to the checker selection', () => {
    const library = new TextureLibrary();
    library.entriesAppend([entryCreate('a.png'), entryCreate('b.png')]);
    library.selectById('a.png');
    expect(library.entriesRemove(new Set(['a.png', 'missing.png']))).toBe(1);
    expect(library.getEntryById('a.png')).toBeNull();
    expect(library.getEntryById('b.png')).not.toBeNull();
    expect(library.getSelectedId()).not.toBe('a.png');
  });
});

describe('texture source gate', () => {
  it('blocks with a message until cleared', () => {
    expect(textureSourceBlocked()).toBeNull();
    textureSourceGateSet(() => 'owner only');
    expect(textureSourceBlocked()).toBe('owner only');
    textureSourceGateSet(null);
    expect(textureSourceBlocked()).toBeNull();
  });
});

describe('stream sender abort filter', () => {
  it('aborts only the selected streams and tells the relay', () => {
    const messages: Record<string, unknown>[] = [];
    const transport = {
      send: (message: object) => messages.push(message as Record<string, unknown>),
      sendBinary: () => undefined,
    };
    const sender = new StreamCollaborationSender(transport, 4, 8);
    sender.start(2, 'asset', new Uint8Array(64), 'a.png', 'image/png', 'old');
    sender.start(2, 'asset', new Uint8Array(64), 'b.png', 'image/png', 'same');
    sender.start(3, 'asset', new Uint8Array(64), 'a.png', 'image/png', 'old');
    const aborted = sender.abortWhere(
      (info) => info.to === 2 && info.name === 'a.png' && info.tag !== 'new',
      'texture_revised',
    );
    expect(aborted).toBe(1);
    expect(messages.filter((message) => message['t'] === 'stream.abort')).toEqual([
      { t: 'stream.abort', to: 2, stream: 1, reason: 'texture_revised' },
    ]);
    expect(sender.activeCountFor(2)).toBe(1);
    expect(sender.activeCountFor(3)).toBe(1);
  });
});

describe('member applying a revision', () => {
  /**
   * Builds a member session over a real library.
   *
   * @returns Session, library, sent messages and rebuilt id sets.
   */
  function memberCreate(): {
    session: TexturesCollaborationSession;
    library: TextureLibrary;
    sent: Record<string, unknown>[];
    revised: (ReadonlySet<string> | null)[];
  } {
    const sent: Record<string, unknown>[] = [];
    const transport = {
      limits: SOCKET_COLLABORATION_LIMITS_DEFAULT,
      send: (message: object) => sent.push(message as Record<string, unknown>),
    } as unknown as SessionCollaborationTransport;
    const sender = new StreamCollaborationSender({ send: () => undefined, sendBinary: () => undefined }, 4, 8);
    const library = new TextureLibrary();
    const session = new TexturesCollaborationSession(transport, sender, () => library);
    const revised: (ReadonlySet<string> | null)[] = [];
    session.revisionHooksSet(
      (ids) => revised.push(ids),
      () => new Set(['a.png']),
    );
    return { session, library, sent, revised };
  }

  /**
   * Delivers a notice as a completed owner stream.
   *
   * @param session Member session.
   * @param bytes Notice bytes.
   */
  function noticeDeliver(session: TexturesCollaborationSession, bytes: Uint8Array): void {
    const name = TEXTURES_COLLABORATION_REVISION_NAME;
    session.received({
      stream: 9,
      kind: 'asset',
      size: bytes.byteLength,
      name,
      mime: 'application/json',
      bytes,
      received: bytes.byteLength,
      parts: [],
    });
  }

  it('drops revised textures, refetches the used ones and ignores replays', () => {
    const { session, library, sent, revised } = memberCreate();
    library.entriesAppend([entryCreate('a.png'), entryCreate('b.png')]);
    noticeDeliver(session, texturesCollaborationRevisionEncode(1, ['a.png', 'b.png']));
    expect(library.getEntryById('a.png')).toBeNull();
    expect(library.getEntryById('b.png')).toBeNull();
    expect(sent).toEqual([{ t: 'asset.request', name: 'a.png' }]);
    expect(revised).toEqual([new Set(['a.png', 'b.png'])]);
    noticeDeliver(session, texturesCollaborationRevisionEncode(1, ['a.png']));
    expect(sent.length).toBe(1);
  });

  it('requests again when old bytes of a revised texture arrive or are aborted', () => {
    const { session, sent } = memberCreate();
    void session.ensure([{ id: 'n', data: { textureId: 'a.png' } } as never]);
    expect(sent).toEqual([{ t: 'asset.request', name: 'a.png' }]);
    noticeDeliver(session, texturesCollaborationRevisionEncode(1, ['a.png']));
    const old = pngHeaderCreate(4, 4);
    session.received({
      stream: 2,
      kind: 'asset',
      size: old.byteLength,
      name: 'a.png',
      mime: 'image/png',
      bytes: old,
      received: old.byteLength,
      parts: [],
    });
    expect(sent.length).toBe(2);
    expect(sent[1]).toEqual({ t: 'asset.request', name: 'a.png' });
  });
});
