import type { SocketCollaborationMessage } from '@/collaboration/net/socket_collaboration_types.js';
import { CHAT_TEXT_WIRE_MAXIMUM } from '@/collaboration/shared/chat_text_policy.js';
import { DISPLAY_NAME_LENGTH_MAXIMUM } from '@/collaboration/shared/room_name_policy.js';

/** One chat message as the relay delivered it. */
export interface EntryCollaborationChat {
  /** Per-room sequence number; orders messages. */
  id: number;
  /** Relay user id of the sender. */
  from: number;
  /** Room-unique display name of the sender. */
  name: string;
  /** Color slot of the sender. */
  color: number;
  /** Normalized text, shown verbatim as plain text. */
  text: string;
  /** Relay receive time (epoch ms). */
  at: number;
}

/**
 * Returns whether a value is a non-negative safe integer.
 *
 * @param value Untrusted value.
 * @returns True for a usable integer.
 */
function entryCollaborationChatInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Returns whether a value is a string of at most a given length.
 *
 * @param value Untrusted value.
 * @param maximum Most UTF-16 code units.
 * @returns True for a usable string.
 */
function entryCollaborationChatString(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length <= maximum;
}

/**
 * Reads a `chat` or `chat.sent` message from the relay. Anything malformed is
 * dropped rather than shown.
 *
 * @param message Untrusted relay message.
 * @returns Chat entry, or null when malformed.
 */
export function entryCollaborationChatParse(message: SocketCollaborationMessage): EntryCollaborationChat | null {
  const { id, from, name, color, text, at } = message;
  if (!entryCollaborationChatInteger(id) || !entryCollaborationChatInteger(from)) return null;
  if (!entryCollaborationChatInteger(color) || !entryCollaborationChatInteger(at)) return null;
  if (!entryCollaborationChatString(name, DISPLAY_NAME_LENGTH_MAXIMUM * 4)) return null;
  if (!entryCollaborationChatString(text, CHAT_TEXT_WIRE_MAXIMUM) || text === '') return null;
  return { id, from, name, color, text, at };
}
