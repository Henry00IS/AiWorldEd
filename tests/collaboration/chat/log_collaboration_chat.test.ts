import { describe, expect, it } from 'vitest';
import type { EntryCollaborationChat } from '@/collaboration/chat/entry_collaboration_chat.js';
import {
  LOG_COLLABORATION_CHAT_AGE_MAXIMUM_MS,
  LOG_COLLABORATION_CHAT_GROUP_MS,
  LogCollaborationChat,
  logCollaborationChatGrouped,
} from '@/collaboration/chat/log_collaboration_chat.js';

/**
 * Builds a chat entry.
 *
 * @param id Relay id.
 * @param from Sender.
 * @param at Time (epoch ms).
 * @returns Entry.
 */
function entry(id: number, from: number, at: number): EntryCollaborationChat {
  return { id, from, name: `U${from}`, color: from, text: `m${id}`, at };
}

/** Message log: order, grouping, cap and expiry. */
describe('log_collaboration_chat', () => {
  it('groups one sender within five minutes only', () => {
    const first = entry(1, 1, 0);
    expect(logCollaborationChatGrouped(undefined, first)).toBe(false);
    expect(logCollaborationChatGrouped(first, entry(2, 1, LOG_COLLABORATION_CHAT_GROUP_MS - 1))).toBe(true);
    expect(logCollaborationChatGrouped(first, entry(2, 1, LOG_COLLABORATION_CHAT_GROUP_MS))).toBe(false);
    expect(logCollaborationChatGrouped(first, entry(2, 2, 10))).toBe(false);
  });

  it('keeps id order and ignores duplicates', () => {
    const log = new LogCollaborationChat();
    expect(log.insert(entry(2, 1, 20))?.index).toBe(0);
    expect(log.insert(entry(1, 1, 10))?.index).toBe(0);
    expect(log.insert(entry(3, 1, 30))?.index).toBe(2);
    expect(log.insert(entry(2, 1, 20))).toBeNull();
    expect(log.entries().map((item) => item.id)).toEqual([1, 2, 3]);
  });

  it('drops the oldest message when full', () => {
    const log = new LogCollaborationChat(2);
    log.insert(entry(1, 1, 1));
    log.insert(entry(2, 1, 2));
    expect(log.insert(entry(3, 1, 3))).toEqual({ index: 1, dropped: 1 });
    expect(log.insert(entry(0, 1, 0))).toBeNull();
    expect(log.entries().map((item) => item.id)).toEqual([2, 3]);
  });

  it('expires messages older than an hour', () => {
    const log = new LogCollaborationChat();
    log.insert(entry(1, 1, 0));
    log.insert(entry(2, 1, 1000));
    expect(log.expire(LOG_COLLABORATION_CHAT_AGE_MAXIMUM_MS + 500)).toBe(1);
    expect(log.entries().map((item) => item.id)).toEqual([2]);
    log.clear();
    expect(log.entries()).toEqual([]);
  });
});
