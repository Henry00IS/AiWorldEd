import { describe, expect, it } from 'vitest';
import {
  type EntryCollaborationChat,
  entryCollaborationChatPresence,
} from '@/collaboration/chat/entry_collaboration_chat.js';
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

  it('puts a presence line after the newest message and never groups it', () => {
    const log = new LogCollaborationChat();
    log.insert(entry(1, 1, 10));
    const line = entryCollaborationChatPresence(log.newestId(), 1, 'U1', 1, false, 11);
    expect(log.insert(line)?.index).toBe(1);
    expect(log.insert(entry(2, 1, 12))?.index).toBe(2);
    expect(logCollaborationChatGrouped(log.entries()[0], line)).toBe(false);
    expect(logCollaborationChatGrouped(line, entry(2, 1, 12))).toBe(false);
    expect(log.newestId()).toBe(2);
  });

  it('keeps refusing a repeated message after its presence line is dropped', () => {
    const log = new LogCollaborationChat(2);
    log.insert(entry(1, 1, 10));
    log.insert(entryCollaborationChatPresence(1, 2, 'U2', 2, true, 11));
    log.insert(entry(2, 2, 12));
    expect(log.entries().map((item) => item.presence ?? item.id)).toEqual(['joined', 2]);
    log.insert(entry(3, 2, 13));
    expect(log.insert(entry(2, 2, 12))).toBeNull();
    expect(log.entries().map((item) => item.id)).toEqual([2, 3]);
  });

  it('keeps two presence lines with the same id', () => {
    const log = new LogCollaborationChat();
    log.insert(entryCollaborationChatPresence(0, 2, 'U2', 2, true, 1));
    log.insert(entryCollaborationChatPresence(0, 2, 'U2', 2, false, 2));
    expect(log.entries().map((item) => item.presence)).toEqual(['joined', 'left']);
  });
});
