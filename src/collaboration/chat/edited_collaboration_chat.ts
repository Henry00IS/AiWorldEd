import type { SocketCollaborationMessage } from '@/collaboration/net/socket_collaboration_types.js';
import type { EntryCollaborationChat } from '@/collaboration/chat/entry_collaboration_chat.js';
import {
  CHAT_EDIT_WINDOW_MS,
  CHAT_EDITS_PER_MESSAGE_MAXIMUM,
  CHAT_TEXT_WIRE_MAXIMUM,
  chatTextNormalize,
} from '@/collaboration/shared/chat_text_policy.js';

/**
 * Extra time after the edit window in which an edit may still arrive, covering
 * the relay's low-priority chat delivery to this editor.
 */
export const EDITED_COLLABORATION_CHAT_GRACE_MS = 15 * 1000;

/** One chat edit as the relay delivered it. */
export interface EditedCollaborationChat {
  /** Id of the edited message. */
  id: number;
  /** Relay user id of the editor. */
  from: number;
  /** New text, untrusted until accepted. */
  text: string;
  /** Relay time of the edit (epoch ms). */
  at: number;
}

/**
 * Returns whether a value is a non-negative safe integer.
 *
 * @param value Untrusted value.
 * @returns True for a usable integer.
 */
function editedCollaborationChatInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Reads a `chat.edited` message from the relay; anything malformed is dropped.
 *
 * @param message Untrusted relay message.
 * @returns Edit, or null when malformed.
 */
export function editedCollaborationChatParse(message: SocketCollaborationMessage): EditedCollaborationChat | null {
  const { id, from, text, at } = message;
  if (message.t !== 'chat.edited') return null;
  if (!editedCollaborationChatInteger(id) || !editedCollaborationChatInteger(from)) return null;
  if (!editedCollaborationChatInteger(at)) return null;
  if (typeof text !== 'string' || text === '' || text.length > CHAT_TEXT_WIRE_MAXIMUM) return null;
  return { id, from, text, at };
}

/**
 * Checks an edit against the message it replaces: only the author, only text
 * messages, only within the edit window as this editor saw the message, and at
 * most a fixed number of times. The relay checks the same, but receivers do not
 * trust it.
 *
 * @param entry Message in the log, if still kept.
 * @param edit Parsed edit.
 * @param now Current local time (epoch ms).
 * @returns The cleaned new text, or null when refused.
 */
export function editedCollaborationChatAccept(
  entry: EntryCollaborationChat | undefined,
  edit: EditedCollaborationChat,
  now: number,
): string | null {
  if (entry === undefined || entry.file !== undefined || entry.from !== edit.from) return null;
  if (entry.seenAt === undefined || now - entry.seenAt > CHAT_EDIT_WINDOW_MS + EDITED_COLLABORATION_CHAT_GRACE_MS)
    return null;
  if ((entry.edits ?? 0) >= CHAT_EDITS_PER_MESSAGE_MAXIMUM) return null;
  const normalized = chatTextNormalize(edit.text);
  return normalized.ok ? normalized.text : null;
}
