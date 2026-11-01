import { ComposerCollaborationChat } from '@/collaboration/chat/composer_collaboration_chat.js';
import { ListCollaborationChat } from '@/collaboration/chat/list_collaboration_chat.js';
import { PanelFloating } from '@/ui/floating_panel/panel_floating.js';
import { applyFloatingPanelToolChrome } from '@/ui/floating_panel/panel_floating_tool_chrome.js';

/** Default chat window width. */
const PANEL_COLLABORATION_CHAT_WIDTH_PX = 380;
/** Default chat window height. */
const PANEL_COLLABORATION_CHAT_HEIGHT_PX = 460;

/** Callbacks of the chat window. */
export interface PanelCollaborationChatHandlers {
  /**
   * The user sends a message.
   *
   * @param text Raw text from the field.
   */
  send(text: string): void;
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
  private readonly handlers: PanelCollaborationChatHandlers;
  private readonly titleLabel: HTMLElement;

  /**
   * Builds the hidden window.
   *
   * @param host Parent element.
   * @param handlers Window callbacks.
   * @param anchor Viewport container used for the first position.
   * @param clock Returns the current time (epoch ms).
   */
  constructor(
    host: HTMLElement,
    handlers: PanelCollaborationChatHandlers,
    anchor: HTMLElement | null = null,
    clock: () => number = Date.now,
  ) {
    super(host, { corner: 'bottom-right', closeOnEscape: false }, anchor);
    this.handlers = handlers;
    this.list = new ListCollaborationChat(clock);
    this.composer = new ComposerCollaborationChat((text) => this.handlers.send(text));
    const title = this.createStandardTitleBar({ titleText: 'Chat', flexShrinkZero: true });
    this.titleLabel = title.title;
    this.chromeApply();
    this.root.append(title.bar, this.list.root, this.composer.element);
  }

  /**
   * Shows the room name in the title bar.
   *
   * @param room Room name, or an empty string outside a room.
   */
  titleSet(room: string): void {
    this.titleLabel.textContent = room === '' ? 'Chat' : `Chat \u00b7 ${room}`;
  }

  /** Applies the tool window look; the window can be resized from its corner. */
  private chromeApply(): void {
    this.root.className = 'editor-chat-window';
    applyFloatingPanelToolChrome(this.root, {
      width: `${PANEL_COLLABORATION_CHAT_WIDTH_PX}px`,
      height: `${PANEL_COLLABORATION_CHAT_HEIGHT_PX}px`,
      minWidth: '260px',
      minHeight: '220px',
      borderBox: true,
      overflowHidden: true,
    });
    this.root.style.resize = 'both';
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
