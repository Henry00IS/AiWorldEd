import { Theme } from '@/theme.js';
import { hexToRgb } from '@/utils/utils_color.js';
import { statusBarLabelStyle } from '@/ui/status/status_bar.js';

/** Highest unread count shown before "99+". */
const BUTTON_COLLABORATION_CHAT_UNREAD_SHOWN = 99;

/** Status bar chat button with the unread badge; shown only in a room. */
export class ButtonCollaborationChat {
  readonly element: HTMLButtonElement;
  readonly badge: HTMLElement;

  /**
   * Creates the button in front of the first status bar panel item.
   *
   * @param statusBar Status bar root.
   * @param onClick Toggles the chat window.
   */
  constructor(statusBar: HTMLElement, onClick: () => void) {
    this.badge = buttonCollaborationChatBadge();
    this.element = document.createElement('button');
    this.element.type = 'button';
    this.element.className = 'editor-chat-button';
    this.element.title = 'Room chat';
    this.element.setAttribute('aria-label', 'Room chat');
    this.element.style.cssText =
      'display:none;align-items:center;gap:5px;padding:0 8px;margin-right:4px;background:transparent;border:none;cursor:pointer';
    statusBarLabelStyle(this.element);
    this.element.append(document.createTextNode('\u{1F4AC} Chat'), this.badge);
    this.element.addEventListener('click', (event) => {
      event.stopPropagation();
      onClick();
    });
    const panel = statusBar.lastElementChild ?? statusBar;
    panel.insertBefore(this.element, panel.firstChild);
  }

  /**
   * Shows or hides the button.
   *
   * @param visible True in a room.
   */
  visibleSet(visible: boolean): void {
    this.element.style.display = visible ? 'inline-flex' : 'none';
  }

  /**
   * Shows the number of unread messages.
   *
   * @param count Unread count; 0 hides the badge.
   */
  unreadSet(count: number): void {
    this.badge.style.display = count > 0 ? 'inline-block' : 'none';
    this.badge.textContent =
      count > BUTTON_COLLABORATION_CHAT_UNREAD_SHOWN ? `${BUTTON_COLLABORATION_CHAT_UNREAD_SHOWN}+` : String(count);
    this.element.title = count > 0 ? `Room chat (${count} unread)` : 'Room chat';
  }

  /** Removes the button. */
  dispose(): void {
    this.element.remove();
  }
}

/**
 * Creates the round unread badge.
 *
 * @returns Badge element.
 */
function buttonCollaborationChatBadge(): HTMLElement {
  const badge = document.createElement('span');
  badge.className = 'editor-chat-badge';
  badge.style.cssText =
    'display:none;min-width:16px;height:16px;padding:0 4px;box-sizing:border-box;border-radius:8px;font:700 10px/16px sans-serif;text-align:center;color:#ffffff';
  badge.style.background = hexToRgb(Theme.selectionColor);
  return badge;
}
