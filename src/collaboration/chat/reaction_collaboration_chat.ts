import type { EntryCollaborationChat } from '@/collaboration/chat/entry_collaboration_chat.js';
import type { SocketCollaborationMessage } from '@/collaboration/net/socket_collaboration_types.js';
import {
  CHAT_REACTION_EMOJIS_PER_MESSAGE_MAXIMUM,
  CHAT_REACTION_WINDOW_MS,
  CHAT_REACTIONS_PER_MEMBER_MAXIMUM,
  CHAT_REACTIONS_PER_MESSAGE_MAXIMUM,
  CHAT_REACTIONS_PER_WINDOW,
  chatReactionEmojiIs,
} from '@/collaboration/shared/chat_text_policy.js';

/** Most members whose recent reactions are counted for the rate limit. */
export const REACTION_COLLABORATION_CHAT_USERS_MAXIMUM = 64;
/** Most names listed in a reaction tooltip before "and N others". */
const REACTION_COLLABORATION_CHAT_NAMES_SHOWN = 10;

/** One reaction change as the relay delivered it. */
export interface ReactionCollaborationChat {
  /** Id of the message. */
  id: number;
  /** Relay user id of the member who reacted. */
  from: number;
  /** One checked emoji. */
  emoji: string;
  /** True when added, false when removed. */
  on: boolean;
}

/**
 * Returns whether a value is a non-negative safe integer.
 *
 * @param value Untrusted value.
 * @returns True for a usable integer.
 */
function reactionCollaborationChatInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Reads a `chat.reaction` message; anything malformed or not exactly one emoji
 * is dropped.
 *
 * @param message Untrusted relay message.
 * @returns Reaction, or null when malformed.
 */
export function reactionCollaborationChatParse(message: SocketCollaborationMessage): ReactionCollaborationChat | null {
  const { id, from, emoji, on } = message;
  if (message.t !== 'chat.reaction' || typeof on !== 'boolean') return null;
  if (!reactionCollaborationChatInteger(id) || !reactionCollaborationChatInteger(from)) return null;
  if (typeof emoji !== 'string' || !chatReactionEmojiIs(emoji)) return null;
  return { id, from, emoji, on };
}

/**
 * Adds or removes a reaction on a message within the caps on emoji per message,
 * reactions per message and reactions per member. The relay applies the same
 * caps, but receivers do not trust it.
 *
 * @param entry Message.
 * @param reaction Parsed reaction.
 * @param name Display name of the member who reacted.
 * @returns True when the reactions changed.
 */
export function reactionCollaborationChatApply(
  entry: EntryCollaborationChat,
  reaction: ReactionCollaborationChat,
  name: string,
): boolean {
  const reactions = entry.reactions ?? new Map<string, Map<number, string>>();
  const users = reactions.get(reaction.emoji);
  if ((users?.has(reaction.from) ?? false) === reaction.on) return false;
  if (!reaction.on) {
    users?.delete(reaction.from);
    if (users?.size === 0) reactions.delete(reaction.emoji);
    return true;
  }
  if (!reactionCollaborationChatRoom(reactions, reaction.from, users === undefined)) return false;
  reactions.set(reaction.emoji, (users ?? new Map<number, string>()).set(reaction.from, name));
  entry.reactions = reactions;
  return true;
}

/**
 * Returns whether a message has room for one more reaction of a member.
 *
 * @param reactions Reactions of the message.
 * @param user Reacting member.
 * @param emojiNew True when the emoji is not on the message yet.
 * @returns True within every cap.
 */
function reactionCollaborationChatRoom(
  reactions: ReadonlyMap<string, ReadonlyMap<number, string>>,
  user: number,
  emojiNew: boolean,
): boolean {
  if (emojiNew && reactions.size >= CHAT_REACTION_EMOJIS_PER_MESSAGE_MAXIMUM) return false;
  let total = 0;
  let own = 0;
  for (const users of reactions.values()) {
    total += users.size;
    if (users.has(user)) own += 1;
  }
  return total < CHAT_REACTIONS_PER_MESSAGE_MAXIMUM && own < CHAT_REACTIONS_PER_MEMBER_MAXIMUM;
}

/**
 * Describes who reacted with an emoji; the own reaction is named "You" and
 * listed last.
 *
 * @param emoji Emoji.
 * @param users Display names by relay user id.
 * @param self Relay user id of this connection.
 * @returns Tooltip text.
 */
export function reactionCollaborationChatCaption(
  emoji: string,
  users: ReadonlyMap<number, string>,
  self: number,
): string {
  const names = [...users].filter(([user]) => user !== self).map(([, name]) => name);
  if (users.has(self)) names.push('You');
  const shown = names.slice(0, REACTION_COLLABORATION_CHAT_NAMES_SHOWN);
  const others = names.length - shown.length;
  const last = others > 0 ? `${others} others` : shown.pop();
  const list = shown.length === 0 ? (last ?? '') : `${shown.join(', ')} and ${last ?? ''}`;
  return `${list} reacted with ${emoji}`;
}

/**
 * Per-member rate limit on received reactions, so a member cannot make this
 * editor redraw without end. Allows twice the relay rate because deliveries can
 * bunch up.
 */
export class ReactionCollaborationChatLimiter {
  private readonly times: Map<number, number[]>;

  /** Creates an empty limiter. */
  constructor() {
    this.times = new Map();
  }

  /**
   * Counts one reaction of a member when the window allows it.
   *
   * @param user Relay user id.
   * @param now Current time (epoch ms).
   * @returns True when admitted.
   */
  admit(user: number, now: number): boolean {
    const times = (this.times.get(user) ?? []).filter((at) => now - at < CHAT_REACTION_WINDOW_MS);
    if (times.length >= CHAT_REACTIONS_PER_WINDOW * 2) return false;
    times.push(now);
    this.times.delete(user);
    this.times.set(user, times);
    for (const oldest of this.times.keys()) {
      if (this.times.size <= REACTION_COLLABORATION_CHAT_USERS_MAXIMUM) break;
      this.times.delete(oldest);
    }
    return true;
  }

  /**
   * Returns how many members are tracked.
   *
   * @returns Member count.
   */
  size(): number {
    return this.times.size;
  }

  /** Forgets every member, e.g. after leaving the room. */
  clear(): void {
    this.times.clear();
  }
}
