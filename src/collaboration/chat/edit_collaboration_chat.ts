import type { ActionsCollaborationChatAction } from '@/collaboration/chat/actions_collaboration_chat.js';
import { EditCollaborationChatBox } from '@/collaboration/chat/edit_collaboration_chat_box.js';
import {
  editedCollaborationChatAccept,
  editedCollaborationChatParse,
} from '@/collaboration/chat/edited_collaboration_chat.js';
import type { EntryCollaborationChat } from '@/collaboration/chat/entry_collaboration_chat.js';
import type { ListCollaborationChat } from '@/collaboration/chat/list_collaboration_chat.js';
import {
  SocketCollaborationError,
  type SocketCollaborationMessage,
} from '@/collaboration/net/socket_collaboration_types.js';
import { CHAT_EDIT_WINDOW_MS, chatTextClean } from '@/collaboration/shared/chat_text_policy.js';

/** Pencil drawn in a 16 by 16 box. */
const EDIT_COLLABORATION_CHAT_ICON =
  'M11.3 1.3a1.6 1.6 0 0 1 2.3 0l1.1 1.1a1.6 1.6 0 0 1 0 2.3L5.4 14 1.5 15l1-3.9zM10.2 3.8l2 2 1.1-1.1-2-2z';

/** Relay services editing uses. */
export interface EditCollaborationChatLink {
  /**
   * Replaces the text of an own message.
   *
   * @param id Message id.
   * @param text Raw new text.
   * @returns The relay's `chat.edited` reply; rejects with
   *   SocketCollaborationError.
   */
  chatEdit(id: number, text: string): Promise<SocketCollaborationMessage>;
  /**
   * Returns whether the relay agreed on editing.
   *
   * @returns True when edits can be sent.
   */
  chatEditAvailable(): boolean;
  /**
   * Returns the relay user id of this connection.
   *
   * @returns User id.
   */
  user(): number;
}

/**
 * Explains why the relay refused an edit.
 *
 * @param error Error from chatEdit.
 * @returns Text shown under the edit field, or null for errors chat messages
 *   share.
 */
export function editCollaborationChatErrorText(error: unknown): string | null {
  if (!(error instanceof SocketCollaborationError)) return 'The edit could not be saved. Check your connection.';
  const reason = error.details['reason'];
  if (error.code === 'chat_rate_limited') return 'Slow down: one edit per second.';
  if (error.code !== 'chat_edit_refused') return null;
  if (reason === 'not_author') return 'Only the sender can edit a message.';
  if (reason === 'too_many') return 'This message was edited too many times.';
  if (reason === 'unsupported') return 'This server cannot edit messages.';
  return 'This message can no longer be edited.';
}

/**
 * Editing of own chat messages for a few minutes after sending them, and the
 * checked application of edits by other members.
 */
export class EditCollaborationChat {
  private readonly list: ListCollaborationChat;
  private readonly link: EditCollaborationChatLink;
  private readonly clock: () => number;
  private readonly errorText: (error: unknown) => string;
  private box: EditCollaborationChatBox | null;

  /**
   * Creates the editing of a chat list.
   *
   * @param list Message list.
   * @param link Relay services.
   * @param clock Returns the current time (epoch ms).
   * @param errorText Explains relay errors that are not specific to edits.
   */
  constructor(
    list: ListCollaborationChat,
    link: EditCollaborationChatLink,
    clock: () => number,
    errorText: (error: unknown) => string,
  ) {
    this.list = list;
    this.link = link;
    this.clock = clock;
    this.errorText = errorText;
    this.box = null;
  }

  /**
   * Returns the Edit action of the message toolbar.
   *
   * @returns Action.
   */
  action(): ActionsCollaborationChatAction {
    return {
      label: 'Edit',
      icon: EDIT_COLLABORATION_CHAT_ICON,
      shown: (entry) => this.editable(entry) && this.list.editingId() !== entry.id,
      run: (entry) => this.start(entry),
    };
  }

  /**
   * Edits the newest own message on Up in an empty message field.
   *
   * @param field Message field of the composer.
   */
  upArrowBind(field: HTMLTextAreaElement): void {
    field.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowUp' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.isComposing || field.value !== '') return;
      if (this.last()) event.preventDefault();
    });
  }

  /**
   * Returns whether the user may edit a message right now.
   *
   * @param entry Message.
   * @returns True for own text messages inside the edit window.
   */
  editable(entry: EntryCollaborationChat): boolean {
    if (entry.file !== undefined || entry.seenAt === undefined || !this.link.chatEditAvailable()) return false;
    return entry.from === this.link.user() && this.clock() - entry.seenAt < CHAT_EDIT_WINDOW_MS;
  }

  /**
   * Starts editing the newest own message that can still be edited.
   *
   * @returns True when an edit started.
   */
  last(): boolean {
    const entries = this.list.entries();
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index];
      if (entry === undefined || entry.from !== this.link.user() || entry.file !== undefined) continue;
      if (!this.editable(entry)) return false;
      this.start(entry);
      return true;
    }
    return false;
  }

  /**
   * Replaces a message's text with the inline editor.
   *
   * @param entry Own message.
   */
  start(entry: EntryCollaborationChat): void {
    if (!this.editable(entry)) return;
    const box = new EditCollaborationChatBox(entry.text, {
      save: (text) => void this.save(entry, box, text),
      cancel: () => this.close(),
    });
    this.box = box;
    this.list.editOpen(entry.id, box.element);
    box.focus();
  }

  /** Stops editing without saving. */
  close(): void {
    if (this.box === null) return;
    this.box = null;
    this.list.editClose();
  }

  /**
   * Applies an edit the relay delivered once it passes every check.
   *
   * @param message Untrusted `chat.edited` message.
   * @returns True when applied.
   */
  received(message: SocketCollaborationMessage): boolean {
    const edit = editedCollaborationChatParse(message);
    if (edit === null) return false;
    const entry = this.list.entry(edit.id);
    const text = editedCollaborationChatAccept(entry, edit, this.clock());
    if (entry === undefined || text === null) return false;
    entry.text = text;
    entry.edited = edit.at;
    entry.edits = (entry.edits ?? 0) + 1;
    this.list.refresh(entry.id);
    return true;
  }

  /**
   * Sends the new text; nothing changed or an empty text just stops editing.
   *
   * @param entry Edited message.
   * @param box Its editor.
   * @param raw Field text.
   */
  private async save(entry: EntryCollaborationChat, box: EditCollaborationChatBox, raw: string): Promise<void> {
    const text = chatTextClean(raw);
    if (text === '' || text === entry.text) return this.close();
    if (!this.editable(entry)) return box.noticeSet('This message can no longer be edited.');
    box.noticeSet('');
    box.busySet(true);
    try {
      const reply = await this.link.chatEdit(entry.id, text);
      if (this.box !== box) return;
      this.close();
      this.received(reply);
    } catch (error) {
      if (this.box !== box) return;
      box.busySet(false);
      box.noticeSet(editCollaborationChatErrorText(error) ?? this.errorText(error));
    }
  }
}
