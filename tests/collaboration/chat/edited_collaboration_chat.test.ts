import { describe, expect, it } from 'vitest';
import {
  EDITED_COLLABORATION_CHAT_GRACE_MS,
  editedCollaborationChatAccept,
  editedCollaborationChatParse,
  type EditedCollaborationChat,
} from '@/collaboration/chat/edited_collaboration_chat.js';
import type { EntryCollaborationChat } from '@/collaboration/chat/entry_collaboration_chat.js';
import { CHAT_EDIT_WINDOW_MS, CHAT_EDITS_PER_MESSAGE_MAXIMUM } from '@/collaboration/shared/chat_text_policy.js';

/**
 * Builds a received message.
 *
 * @param overrides Fields to replace.
 * @returns Entry.
 */
function entry(overrides: Partial<EntryCollaborationChat> = {}): EntryCollaborationChat {
  return { id: 4, from: 2, name: 'Henry2', color: 2, text: 'helo', at: 500, seenAt: 10_000, ...overrides };
}

/**
 * Builds an edit.
 *
 * @param overrides Fields to replace.
 * @returns Edit.
 */
function edit(overrides: Partial<EditedCollaborationChat> = {}): EditedCollaborationChat {
  return { id: 4, from: 2, text: 'hello', at: 900, ...overrides };
}

describe('editedCollaborationChatParse', () => {
  it('reads a well-formed edit', () => {
    expect(editedCollaborationChatParse({ t: 'chat.edited', id: 4, from: 2, text: 'hi', at: 9 })).toEqual({
      id: 4,
      from: 2,
      text: 'hi',
      at: 9,
    });
  });

  it('drops malformed edits', () => {
    expect(editedCollaborationChatParse({ t: 'chat.edited', id: -1, from: 2, text: 'hi', at: 9 })).toBeNull();
    expect(editedCollaborationChatParse({ t: 'chat.edited', id: 4, from: '2', text: 'hi', at: 9 })).toBeNull();
    expect(editedCollaborationChatParse({ t: 'chat.edited', id: 4, from: 2, text: '', at: 9 })).toBeNull();
    expect(
      editedCollaborationChatParse({ t: 'chat.edited', id: 4, from: 2, text: 'x'.repeat(9000), at: 9 }),
    ).toBeNull();
    expect(editedCollaborationChatParse({ t: 'chat', id: 4, from: 2, text: 'hi', at: 9 })).toBeNull();
  });
});

describe('editedCollaborationChatAccept', () => {
  it('returns the cleaned text of a valid edit', () => {
    expect(editedCollaborationChatAccept(entry(), edit({ text: 'hello\u202e  ' }), 10_000)).toBe('hello');
  });

  it('refuses an edit of a message it does not have', () => {
    expect(editedCollaborationChatAccept(undefined, edit(), 10_000)).toBeNull();
  });

  it('refuses an edit by anyone but the author', () => {
    expect(editedCollaborationChatAccept(entry(), edit({ from: 3 }), 10_000)).toBeNull();
  });

  it('refuses an edit that arrives after the window as this editor saw the message', () => {
    const limit = 10_000 + CHAT_EDIT_WINDOW_MS + EDITED_COLLABORATION_CHAT_GRACE_MS;
    expect(editedCollaborationChatAccept(entry(), edit(), limit)).toBe('hello');
    expect(editedCollaborationChatAccept(entry(), edit(), limit + 1)).toBeNull();
  });

  it('refuses an edit of a message without a local receive time', () => {
    const { seenAt, ...unseen } = entry();
    expect(seenAt).toBe(10_000);
    expect(editedCollaborationChatAccept(unseen, edit(), 10_000)).toBeNull();
  });

  it('refuses edits of file messages', () => {
    const file = { link: 'a'.repeat(22), name: 'a.png', size: 1, mime: 'image/png', url: '' };
    expect(editedCollaborationChatAccept(entry({ file }), edit(), 10_000)).toBeNull();
  });

  it('refuses an edit past the per-message cap', () => {
    const tired = entry({ edits: CHAT_EDITS_PER_MESSAGE_MAXIMUM });
    expect(editedCollaborationChatAccept(tired, edit(), 10_000)).toBeNull();
  });

  it('refuses text that breaks the protocol limits or is empty once cleaned', () => {
    expect(editedCollaborationChatAccept(entry(), edit({ text: 'x'.repeat(2001) }), 10_000)).toBeNull();
    expect(editedCollaborationChatAccept(entry(), edit({ text: '\u200b' }), 10_000)).toBeNull();
    expect(editedCollaborationChatAccept(entry(), edit({ text: 'a\n'.repeat(21) }), 10_000)).toBeNull();
  });
});
