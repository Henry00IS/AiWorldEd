import type { EntryCollaborationChat } from '@/collaboration/chat/entry_collaboration_chat.js';
import {
  renderCollaborationChatAvatar,
  renderCollaborationChatColor,
  renderCollaborationChatGraphemes,
} from '@/collaboration/chat/render_collaboration_chat.js';
import { Theme } from '@/theme.js';
import { UiStackLayers } from '@/ui/stack/ui_stack_layers.js';

/** How long a notification stays after its last message. */
export const TOAST_COLLABORATION_CHAT_VISIBLE_MS = 6000;
/** Longest preview in characters. */
export const TOAST_COLLABORATION_CHAT_PREVIEW_LENGTH = 90;

/**
 * Shortens a message to a one-line preview.
 *
 * @param text Message text.
 * @param maximum Most characters.
 * @returns Preview, ending in an ellipsis when cut.
 */
export function toastCollaborationChatPreview(
  text: string,
  maximum: number = TOAST_COLLABORATION_CHAT_PREVIEW_LENGTH,
): string {
  const line = text.replace(/\s+/gu, ' ').trim();
  const characters = renderCollaborationChatGraphemes(line);
  if (characters.length <= maximum) return line;
  return `${characters
    .slice(0, maximum - 1)
    .join('')
    .trimEnd()}\u2026`;
}

/**
 * Names the senders of a burst.
 *
 * @param names Distinct sender names, oldest first.
 * @returns Text such as "Henry, Ann and 2 others".
 */
export function toastCollaborationChatSenders(names: readonly string[]): string {
  if (names.length <= 2) return names.join(' and ');
  const others = names.length - 2;
  return `${names.slice(0, 2).join(', ')} and ${others} other${others === 1 ? '' : 's'}`;
}

/**
 * Notification for chat messages while the chat window is closed. Messages that
 * arrive while it is up are merged into it ("3 new messages from ..."), so a
 * burst never stacks notifications. Clicking it opens the chat.
 */
export class ToastCollaborationChat {
  readonly element: HTMLElement;
  private readonly onOpen: () => void;
  private readonly visibleMs: number;
  private timer: ReturnType<typeof setTimeout> | null;
  private count: number;
  private names: string[];

  /**
   * Creates the hidden notification.
   *
   * @param onOpen Opens the chat window.
   * @param visibleMs How long it stays after the last message.
   */
  constructor(onOpen: () => void, visibleMs: number = TOAST_COLLABORATION_CHAT_VISIBLE_MS) {
    this.onOpen = onOpen;
    this.visibleMs = visibleMs;
    this.timer = null;
    this.count = 0;
    this.names = [];
    this.element = toastCollaborationChatElement();
    this.element.addEventListener('click', () => {
      this.dismiss();
      this.onOpen();
    });
  }

  /**
   * Returns whether the notification is shown.
   *
   * @returns True when visible.
   */
  isShown(): boolean {
    return this.element.isConnected;
  }

  /**
   * Shows a message, merging it into a notification that is still up.
   *
   * @param entry Message.
   */
  notify(entry: EntryCollaborationChat): void {
    this.count += 1;
    if (!this.names.includes(entry.name)) this.names.push(entry.name);
    this.render(entry);
    if (!this.element.isConnected) document.body.appendChild(this.element);
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.dismiss(), this.visibleMs);
  }

  /** Hides the notification and forgets the burst. */
  dismiss(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.count = 0;
    this.names = [];
    this.element.remove();
  }

  /**
   * Fills the notification for the latest message.
   *
   * @param entry Latest message.
   */
  private render(entry: EntryCollaborationChat): void {
    const single = this.count === 1;
    const color = renderCollaborationChatColor(entry.color);
    const title = toastCollaborationChatLine('editor-chat-toast-title', 'font-weight:600');
    title.textContent = single
      ? entry.name
      : `${this.count} new messages from ${toastCollaborationChatSenders(this.names)}`;
    title.style.color = single ? color : Theme.buttonTextColor;
    const preview = toastCollaborationChatLine('editor-chat-toast-preview', `color:${Theme.buttonTextColor}`);
    preview.textContent = `${single ? '' : `${entry.name}: `}${toastCollaborationChatPreview(entry.text)}`;
    const text = document.createElement('div');
    text.style.cssText = 'flex:1 1 auto;min-width:0';
    text.append(title, preview);
    const avatar = renderCollaborationChatAvatar(entry.name, color);
    avatar.style.position = 'relative';
    avatar.style.flex = '0 0 auto';
    this.element.replaceChildren(avatar, text);
  }
}

/**
 * Creates one single-line text row of the notification.
 *
 * @param className Class name.
 * @param css Extra CSS.
 * @returns Row element.
 */
function toastCollaborationChatLine(className: string, css: string): HTMLElement {
  const line = document.createElement('div');
  line.className = className;
  line.dir = 'auto';
  line.style.cssText = `font-size:12px;line-height:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;unicode-bidi:isolate;${css}`;
  return line;
}

/**
 * Creates the notification card.
 *
 * @returns Card element.
 */
function toastCollaborationChatElement(): HTMLElement {
  const element = document.createElement('div');
  element.className = 'editor-chat-toast';
  element.setAttribute('role', 'status');
  element.title = 'Open chat';
  element.style.cssText = `position:fixed;right:14px;bottom:36px;width:300px;max-width:calc(100vw - 28px);display:flex;align-items:center;gap:10px;padding:10px 12px;box-sizing:border-box;border-radius:8px;cursor:pointer;background:rgba(28,28,28,0.98);border:1px solid rgba(255,255,255,0.12);box-shadow:0 10px 30px rgba(0,0,0,0.6);font-family:${Theme.uiFontFamily}`;
  element.style.zIndex = String(UiStackLayers.floatingPanelCeiling + 1);
  return element;
}
