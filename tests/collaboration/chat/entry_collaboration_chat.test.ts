import { describe, expect, it } from 'vitest';
import { entryCollaborationChatParse } from '@/collaboration/chat/entry_collaboration_chat.js';

const VALID = { t: 'chat', id: 4, from: 2, name: 'Henry', color: 1, text: 'hi', at: 1_700_000_000_000 };

/** Parsing untrusted relay chat messages. */
describe('entry_collaboration_chat', () => {
  it('keeps the fields of a valid message', () => {
    expect(entryCollaborationChatParse(VALID)).toEqual({
      id: 4,
      from: 2,
      name: 'Henry',
      color: 1,
      text: 'hi',
      at: 1_700_000_000_000,
    });
  });

  it('rejects malformed messages', () => {
    expect(entryCollaborationChatParse({ ...VALID, id: -1 })).toBeNull();
    expect(entryCollaborationChatParse({ ...VALID, id: 1.5 })).toBeNull();
    expect(entryCollaborationChatParse({ ...VALID, from: '2' })).toBeNull();
    expect(entryCollaborationChatParse({ ...VALID, text: '' })).toBeNull();
    expect(entryCollaborationChatParse({ ...VALID, text: { html: '<b>' } })).toBeNull();
    expect(entryCollaborationChatParse({ ...VALID, text: 'x'.repeat(9000) })).toBeNull();
    expect(entryCollaborationChatParse({ ...VALID, name: 'n'.repeat(100) })).toBeNull();
    expect(entryCollaborationChatParse({ t: 'chat' })).toBeNull();
  });
  it('reads an optional shared file and rejects a malformed one', () => {
    const file = { link: 'A'.repeat(43), name: 'r\u00e9sum\u00e9.pdf', size: 65_200_000, mime: 'application/pdf' };
    expect(entryCollaborationChatParse({ ...VALID, file })?.file).toEqual({ ...file, url: '' });
    expect(entryCollaborationChatParse({ ...VALID, file: { ...file, link: '../x' } })).toBeNull();
    expect(entryCollaborationChatParse({ ...VALID, file: { ...file, size: -1 } })).toBeNull();
    expect(entryCollaborationChatParse({ ...VALID, file: { ...file, size: 200 * 1024 * 1024 } })).toBeNull();
    expect(entryCollaborationChatParse({ ...VALID, file: { ...file, name: '' } })).toBeNull();
    expect(entryCollaborationChatParse({ ...VALID, file: 'x' })).toBeNull();
  });
});
