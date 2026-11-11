import type { SocketCollaborationMessage } from '@/collaboration/net/socket_collaboration_types.js';
import { CHAT_TEXT_WIRE_MAXIMUM } from '@/collaboration/shared/chat_text_policy.js';
import { DISPLAY_NAME_LENGTH_MAXIMUM } from '@/collaboration/shared/room_name_policy.js';
import { TRANSFER_LINK_PATTERN, TRANSFER_NAME_LENGTH_MAXIMUM } from '@/collaboration/shared/protocol_definitions.js';

/** File shared in a chat message. */
export interface EntryCollaborationChatFile {
  /** Transfer link id of the sender. */
  link: string;
  /** File name, cleaned by the relay. */
  name: string;
  /** Size in bytes. */
  size: number;
  /** MIME type, cleaned by the relay. */
  mime: string;
  /** Download URL; filled in by the chat from the relay URL. */
  url: string;
}

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
  /** Shared file, if any. */
  file?: EntryCollaborationChatFile;
  /**
   * Set on the gray line saying a member joined or left; such a line is no
   * message and has the id of the newest message before it.
   */
  presence?: 'joined' | 'left';
}

/**
 * Builds the gray line saying a member joined or left the room.
 *
 * @param after Id of the newest message shown before the line, or 0.
 * @param user Relay user id of the member.
 * @param name Display name of the member.
 * @param color Color slot of the member.
 * @param joined True for joined, false for left.
 * @param at Time the change was seen (epoch ms).
 * @returns Presence line.
 */
export function entryCollaborationChatPresence(
  after: number,
  user: number,
  name: string,
  color: number,
  joined: boolean,
  at: number,
): EntryCollaborationChat {
  const presence = joined ? 'joined' : 'left';
  const shown = name.slice(0, DISPLAY_NAME_LENGTH_MAXIMUM * 4);
  return {
    id: after,
    from: user,
    name: shown,
    color,
    text: entryCollaborationChatPresenceText(shown, joined),
    at,
    presence,
  };
}

/**
 * Returns the sentence of a presence line.
 *
 * @param name Display name.
 * @param joined True for joined, false for left.
 * @returns Sentence.
 */
export function entryCollaborationChatPresenceText(name: string, joined: boolean): string {
  return `${name} ${joined ? 'joined' : 'left'} the room.`;
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
  const file = entryCollaborationChatFileParse(message['file']);
  if (file === null) return null;
  return file === undefined ? { id, from, name, color, text, at } : { id, from, name, color, text, at, file };
}

/**
 * Reads the optional `file` of a chat message.
 *
 * @param value Untrusted value.
 * @returns File, undefined when absent, or null when malformed.
 */
export function entryCollaborationChatFileParse(value: unknown): EntryCollaborationChatFile | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null) return null;
  const { link, name, size, mime } = value as Record<string, unknown>;
  if (typeof link !== 'string' || !TRANSFER_LINK_PATTERN.test(link)) return null;
  if (!entryCollaborationChatString(name, TRANSFER_NAME_LENGTH_MAXIMUM * 2) || name === '') return null;
  if (!entryCollaborationChatInteger(size)) return null;
  if (!entryCollaborationChatString(mime, 255)) return null;
  return { link, name, size, mime, url: '' };
}
