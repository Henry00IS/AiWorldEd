import type { EntryCollaborationChat } from '@/collaboration/chat/entry_collaboration_chat.js';

/** Messages older than this are removed from the chat (one hour). */
export const LOG_COLLABORATION_CHAT_AGE_MAXIMUM_MS = 60 * 60 * 1000;
/** Most messages kept, so a busy room never grows the window without bound. */
export const LOG_COLLABORATION_CHAT_ENTRIES_MAXIMUM = 300;
/** Consecutive messages of one sender closer than this share one header. */
export const LOG_COLLABORATION_CHAT_GROUP_MS = 5 * 60 * 1000;

/** Where a new message landed in the log. */
export interface LogCollaborationChatInsert {
  /** Index of the new message. */
  index: number;
  /** Oldest messages dropped to stay within the entry cap. */
  dropped: number;
}

/**
 * Returns whether a message continues the group of the message before it: same
 * sender within a few minutes, like Discord.
 *
 * @param previous Message shown above, or undefined at the top.
 * @param entry Message to place.
 * @returns True when the message is shown without its own header.
 */
export function logCollaborationChatGrouped(
  previous: EntryCollaborationChat | undefined,
  entry: EntryCollaborationChat,
): boolean {
  if (previous === undefined || previous.from !== entry.from) return false;
  return entry.at - previous.at >= 0 && entry.at - previous.at < LOG_COLLABORATION_CHAT_GROUP_MS;
}

/**
 * Chat messages of the current room ordered by relay id. Holds no history
 * beyond the session: old messages expire and the cap drops the oldest.
 */
export class LogCollaborationChat {
  private readonly items: EntryCollaborationChat[];
  private readonly ids: Set<number>;
  private readonly maximum: number;

  /**
   * Creates an empty log.
   *
   * @param maximum Most messages kept.
   */
  constructor(maximum: number = LOG_COLLABORATION_CHAT_ENTRIES_MAXIMUM) {
    this.items = [];
    this.ids = new Set();
    this.maximum = Math.max(1, maximum);
  }

  /**
   * Returns the messages, oldest first.
   *
   * @returns Messages.
   */
  entries(): readonly EntryCollaborationChat[] {
    return this.items;
  }

  /**
   * Inserts a message by id; a repeated id is ignored.
   *
   * @param entry Message.
   * @returns Placement, or null for a duplicate or a message older than all
   *   kept ones on a full log.
   */
  insert(entry: EntryCollaborationChat): LogCollaborationChatInsert | null {
    if (this.ids.has(entry.id)) return null;
    let index = this.items.length;
    while (index > 0 && (this.items[index - 1]?.id ?? 0) > entry.id) index -= 1;
    if (index === 0 && this.items.length >= this.maximum) return null;
    this.items.splice(index, 0, entry);
    this.ids.add(entry.id);
    const dropped = this.trim(this.items.length - this.maximum);
    return { index: index - dropped, dropped };
  }

  /**
   * Removes messages older than the age limit.
   *
   * @param now Current time (epoch ms).
   * @param ageMaximumMs Age limit.
   * @returns Number of messages removed from the start.
   */
  expire(now: number, ageMaximumMs: number = LOG_COLLABORATION_CHAT_AGE_MAXIMUM_MS): number {
    let count = 0;
    while (count < this.items.length && now - (this.items[count]?.at ?? now) > ageMaximumMs) count += 1;
    return this.trim(count);
  }

  /** Removes every message. */
  clear(): void {
    this.trim(this.items.length);
  }

  /**
   * Removes messages from the start.
   *
   * @param count Messages to remove; zero or less removes none.
   * @returns Number removed.
   */
  private trim(count: number): number {
    if (count <= 0) return 0;
    this.items.splice(0, count).forEach((entry) => this.ids.delete(entry.id));
    return count;
  }
}
