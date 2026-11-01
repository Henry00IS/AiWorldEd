import type { EntryCollaborationChat } from '@/collaboration/chat/entry_collaboration_chat.js';
import { LogCollaborationChat, logCollaborationChatGrouped } from '@/collaboration/chat/log_collaboration_chat.js';
import { renderCollaborationChatRow } from '@/collaboration/chat/render_collaboration_chat.js';
import { Theme } from '@/theme.js';
import { hexToRgb } from '@/utils/utils_color.js';

/** Distance from the bottom that still counts as "at the bottom". */
export const LIST_COLLABORATION_CHAT_BOTTOM_SLACK_PX = 24;

/**
 * The scrolling message list of the chat window. New messages come in at the
 * bottom; the list follows them only while it is scrolled to the bottom and
 * otherwise shows a "new messages" pill. One DOM row per kept message.
 */
export class ListCollaborationChat {
  readonly root: HTMLElement;
  readonly scroller: HTMLElement;
  readonly pill: HTMLButtonElement;
  private readonly empty: HTMLElement;
  private readonly log: LogCollaborationChat;
  private readonly clock: () => number;
  private unseen: number;

  /**
   * Creates an empty list.
   *
   * @param clock Returns the current time (epoch ms).
   * @param maximum Most messages kept.
   */
  constructor(clock: () => number = Date.now, maximum?: number) {
    this.clock = clock;
    this.log = new LogCollaborationChat(maximum);
    this.unseen = 0;
    this.scroller = listCollaborationChatScroller();
    this.empty = listCollaborationChatEmpty();
    this.pill = listCollaborationChatPill();
    this.pill.addEventListener('click', () => this.scrollToBottom());
    this.scroller.addEventListener('scroll', () => this.scrolled());
    this.root = document.createElement('div');
    this.root.className = 'editor-chat-list';
    this.root.style.cssText = 'position:relative;flex:1 1 auto;min-height:0;display:flex;flex-direction:column';
    this.root.append(this.scroller, this.empty, this.pill);
  }

  /**
   * Returns the kept messages, oldest first.
   *
   * @returns Messages.
   */
  entries(): readonly EntryCollaborationChat[] {
    return this.log.entries();
  }

  /**
   * Returns how many messages arrived below the visible part.
   *
   * @returns Unseen count.
   */
  unseenCount(): number {
    return this.unseen;
  }

  /**
   * Adds a message in id order.
   *
   * @param entry Message.
   * @param follow True to scroll to it even when scrolled up (own messages).
   * @returns True when it was new.
   */
  add(entry: EntryCollaborationChat, follow: boolean = false): boolean {
    const stick = follow || this.atBottom();
    const placed = this.log.insert(entry);
    if (placed === null) return false;
    this.rowsRemove(placed.dropped);
    const row = this.rowRender(placed.index);
    this.scroller.insertBefore(row, this.scroller.children[placed.index] ?? null);
    this.rowRefresh(placed.index + 1);
    if (placed.dropped > 0) this.rowRefresh(0);
    this.emptyUpdate();
    if (stick) this.scrollToBottom();
    else this.unseenAdd();
    return true;
  }

  /**
   * Removes messages older than an hour.
   *
   * @returns Number removed.
   */
  expire(): number {
    const removed = this.log.expire(this.clock());
    this.rowsRemove(removed);
    if (removed > 0) this.rowRefresh(0);
    this.emptyUpdate();
    return removed;
  }

  /** Removes every message, e.g. after leaving the room. */
  clear(): void {
    this.log.clear();
    this.scroller.replaceChildren();
    this.unseen = 0;
    this.pillUpdate();
    this.emptyUpdate();
  }

  /**
   * Returns whether the list shows its last message.
   *
   * @returns True at the bottom.
   */
  atBottom(): boolean {
    const scroller = this.scroller;
    return (
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= LIST_COLLABORATION_CHAT_BOTTOM_SLACK_PX
    );
  }

  /** Scrolls to the newest message and hides the pill. */
  scrollToBottom(): void {
    this.scroller.scrollTop = this.scroller.scrollHeight;
    this.unseen = 0;
    this.pillUpdate();
  }

  /** Hides the pill once the user scrolled down to the end. */
  private scrolled(): void {
    if (this.unseen === 0 || !this.atBottom()) return;
    this.unseen = 0;
    this.pillUpdate();
  }

  /** Counts a message that arrived out of view. */
  private unseenAdd(): void {
    this.unseen += 1;
    this.pillUpdate();
  }

  /** Shows or hides the new messages pill. */
  private pillUpdate(): void {
    this.pill.style.display = this.unseen > 0 ? 'block' : 'none';
    this.pill.textContent = `\u2193 ${this.unseen} new message${this.unseen === 1 ? '' : 's'}`;
  }

  /** Shows the hint while the list is empty. */
  private emptyUpdate(): void {
    this.empty.style.display = this.log.entries().length === 0 ? 'flex' : 'none';
  }

  /**
   * Removes rows from the top.
   *
   * @param count Rows to remove.
   */
  private rowsRemove(count: number): void {
    for (let removed = 0; removed < count; removed += 1) this.scroller.firstElementChild?.remove();
  }

  /**
   * Renders the row of a message, grouped with the one above when possible.
   *
   * @param index Message index.
   * @returns Row element.
   */
  private rowRender(index: number): HTMLElement {
    const entries = this.log.entries();
    const entry = entries[index];
    if (entry === undefined) throw new Error(`chat row ${index} missing`);
    return renderCollaborationChatRow(entry, logCollaborationChatGrouped(entries[index - 1], entry), this.clock());
  }

  /**
   * Re-renders a row whose neighbor above changed.
   *
   * @param index Message index; ignored past the end.
   */
  private rowRefresh(index: number): void {
    const current = this.scroller.children[index];
    if (current === undefined || index >= this.log.entries().length) return;
    current.replaceWith(this.rowRender(index));
  }
}

/**
 * Creates the scrolling container.
 *
 * @returns Scroller.
 */
function listCollaborationChatScroller(): HTMLElement {
  const scroller = document.createElement('div');
  scroller.className = 'editor-chat-scroller';
  scroller.setAttribute('role', 'log');
  scroller.setAttribute('aria-live', 'polite');
  scroller.style.cssText = 'flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;padding:0 0 10px';
  return scroller;
}

/**
 * Creates the hint shown before the first message.
 *
 * @returns Hint element.
 */
function listCollaborationChatEmpty(): HTMLElement {
  const empty = document.createElement('div');
  empty.className = 'editor-chat-empty';
  empty.textContent =
    'No messages yet. Only messages sent while you are in this room appear here; the server keeps no history.';
  empty.style.cssText = `position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;font-size:12px;line-height:17px;pointer-events:none;color:${Theme.statusBarTextColor}`;
  return empty;
}

/**
 * Creates the "new messages" pill.
 *
 * @returns Pill button.
 */
function listCollaborationChatPill(): HTMLButtonElement {
  const pill = document.createElement('button');
  pill.type = 'button';
  pill.className = 'editor-chat-pill';
  pill.style.cssText = `position:absolute;left:50%;bottom:8px;transform:translateX(-50%);display:none;padding:4px 12px;border-radius:12px;border:none;cursor:pointer;font-size:12px;font-weight:600;color:#ffffff;box-shadow:0 2px 8px rgba(0,0,0,0.5);font-family:${Theme.uiFontFamily}`;
  pill.style.background = hexToRgb(Theme.selectionColor);
  return pill;
}
