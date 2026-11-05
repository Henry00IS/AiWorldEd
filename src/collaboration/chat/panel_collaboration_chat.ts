import { ComposerCollaborationChat } from '@/collaboration/chat/composer_collaboration_chat.js';
import { ListCollaborationChat } from '@/collaboration/chat/list_collaboration_chat.js';
import { Theme } from '@/theme.js';
import { PanelFloating } from '@/ui/floating_panel/panel_floating.js';
import { createFloatingPanelResizeGrip } from '@/ui/floating_panel/panel_floating_resize.js';
import { applyFloatingPanelToolChrome } from '@/ui/floating_panel/panel_floating_tool_chrome.js';

/** Default chat window width. */
const PANEL_COLLABORATION_CHAT_WIDTH_PX = 380;
/** Default chat window height. */
const PANEL_COLLABORATION_CHAT_HEIGHT_PX = 460;
/** Smallest chat window width. */
const PANEL_COLLABORATION_CHAT_MIN_WIDTH_PX = 320;
/** Smallest chat window height. */
const PANEL_COLLABORATION_CHAT_MIN_HEIGHT_PX = 373;

/** Callbacks of the chat window. */
export interface PanelCollaborationChatHandlers {
  /**
   * The user sends a message.
   *
   * @param text Raw text from the field.
   */
  send(text: string): void;
  /**
   * The user picked a file to share.
   *
   * @param file Picked file.
   */
  file(file: File): void;
  /** The window was opened. */
  shown(): void;
  /** The window was closed. */
  hidden(): void;
}

/**
 * Room chat editor window: the message list above the message field. Resizable
 * and draggable like the other tool windows.
 */
export class PanelCollaborationChat extends PanelFloating {
  readonly list: ListCollaborationChat;
  readonly composer: ComposerCollaborationChat;
  readonly statusLabel: HTMLElement;
  private readonly handlers: PanelCollaborationChatHandlers;
  private readonly titleLabel: HTMLElement;

  /**
   * Builds the hidden window.
   *
   * @param host Parent element.
   * @param handlers Window callbacks.
   * @param anchor Viewport container used for the first position.
   * @param clock Returns the current time (epoch ms).
   * @param bottomInset Returns the height kept free below the window, such as
   *   the status bar.
   */
  constructor(
    host: HTMLElement,
    handlers: PanelCollaborationChatHandlers,
    anchor: HTMLElement | null = null,
    clock: () => number = Date.now,
    bottomInset: () => number = () => 0,
    onTyped: (() => void) | null = null,
  ) {
    super(host, { corner: 'bottom-right', closeOnEscape: false, bottomInsetPx: bottomInset }, anchor);
    this.handlers = handlers;
    this.list = new ListCollaborationChat(clock);
    this.composer = new ComposerCollaborationChat(
      (text) => this.handlers.send(text),
      (file) => this.handlers.file(file),
      onTyped,
    );
    this.statusLabel = panelCollaborationChatStatusLabel();
    const title = this.createStandardTitleBar({ titleText: 'Chat', flexShrinkZero: true });
    this.titleLabel = title.title;
    this.chromeApply();
    this.root.append(title.bar, this.list.root, this.composer.element, this.statusLabel);
    this.root.appendChild(this.buildResizeGrip());
  }

  /**
   * Shows the room name in the title bar.
   *
   * @param room Room name, or an empty string outside a room.
   */
  titleSet(room: string): void {
    this.titleLabel.textContent = room === '' ? 'Chat' : `Chat \u00b7 ${room}`;
  }

  /**
   * Shows typing status text in the bottom status bar (CSS ellipsis when long).
   *
   * @param text Status text, or empty to clear.
   */
  statusSet(text: string): void {
    this.statusLabel.textContent = text;
    this.statusLabel.title = text;
  }

  /** Applies the tool window look and the Project Browser orange resize grip. */
  private chromeApply(): void {
    this.root.className = 'editor-chat-window';
    applyFloatingPanelToolChrome(this.root, {
      width: `${PANEL_COLLABORATION_CHAT_WIDTH_PX}px`,
      height: `${PANEL_COLLABORATION_CHAT_HEIGHT_PX}px`,
      minWidth: `${PANEL_COLLABORATION_CHAT_MIN_WIDTH_PX}px`,
      minHeight: `${PANEL_COLLABORATION_CHAT_MIN_HEIGHT_PX}px`,
      borderBox: true,
      overflowHidden: true,
    });
    this.root.style.resize = 'none';
  }

  /**
   * Builds the southeast orange resize grip.
   *
   * @returns Grip element.
   */
  private buildResizeGrip(): HTMLElement {
    return createFloatingPanelResizeGrip(this.root, {
      minWidth: PANEL_COLLABORATION_CHAT_MIN_WIDTH_PX,
      minHeight: PANEL_COLLABORATION_CHAT_MIN_HEIGHT_PX,
      place: (left, top) => this.setTopLeftPosition(left, top),
      done: () => this.clampToScreen(),
    });
  }

  /** Scrolls to the newest message and focuses the field. */
  protected override onAfterShow(): void {
    this.list.scrollToBottom();
    this.composer.focus();
    this.handlers.shown();
  }

  /** Reports the close. */
  protected override onAfterHide(): void {
    this.composer.picker.openSet(false);
    this.handlers.hidden();
  }
}

/**
 * Creates the chat status bar used for the typing indicator.
 *
 * @returns Status label.
 */
function panelCollaborationChatStatusLabel(): HTMLElement {
  const label = document.createElement('div');
  label.className = 'editor-chat-status';
  label.style.cssText = `padding:6px 22px 8px 10px;color:${Theme.statusBarTextColor};font:10px monospace;flex:0 0 auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;border-top:1px solid rgba(255,255,255,0.07)`;
  return label;
}
