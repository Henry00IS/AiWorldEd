import {
  EmojiCollaborationChatPicker,
  emojiCollaborationChatInsert,
} from '@/collaboration/chat/emoji_collaboration_chat.js';
import { chatTextClean, chatTextLength, chatTextLines } from '@/collaboration/shared/chat_text_policy.js';
import { uiCollaborationButton } from '@/collaboration/ui/ui_collaboration_elements.js';
import { Theme } from '@/theme.js';

/** What the composer may do right now. */
export interface ComposerCollaborationChatState {
  /** False outside a room or on a relay without chat. */
  enabled: boolean;
  /** Time until the relay accepts the next message. */
  remainingMs: number;
  /** True while a message waits for the relay's reply. */
  sending: boolean;
  /** Longest message in code points. */
  lengthMaximum: number;
  /** Most lines in a message. */
  linesMaximum: number;
  /** Placeholder of the message field. */
  placeholder: string;
}

/** Characters left at which the counter appears. */
const COMPOSER_COLLABORATION_CHAT_COUNTER_FROM = 200;

/**
 * Message field with the emoji and Send buttons. Enter sends, Shift+Enter adds
 * a line; while the send interval runs the button is grayed out and Enter does
 * nothing.
 */
export class ComposerCollaborationChat {
  readonly element: HTMLElement;
  readonly field: HTMLTextAreaElement;
  readonly sendButton: HTMLButtonElement;
  readonly emojiButton: HTMLButtonElement;
  readonly counter: HTMLElement;
  readonly notice: HTMLElement;
  readonly picker: EmojiCollaborationChatPicker;
  private readonly onSend: (text: string) => void;
  private state: ComposerCollaborationChatState;

  /**
   * Creates the composer.
   *
   * @param onSend Receives the text to send.
   */
  constructor(onSend: (text: string) => void) {
    this.onSend = onSend;
    this.state = composerCollaborationChatStateIdle();
    this.field = composerCollaborationChatField();
    this.counter = composerCollaborationChatCounter();
    this.notice = composerCollaborationChatNotice();
    this.picker = new EmojiCollaborationChatPicker((emoji) => emojiCollaborationChatInsert(this.field, emoji));
    this.emojiButton = composerCollaborationChatEmojiButton(() => this.picker.openSet(!this.picker.isOpen()));
    this.sendButton = uiCollaborationButton('Send', true, () => this.submit());
    this.sendButton.className = 'editor-chat-send';
    this.sendButton.style.minWidth = '64px';
    this.element = this.layout();
    this.field.addEventListener('keydown', (event) => this.keyHandle(event));
    this.field.addEventListener('input', () => this.refresh());
    this.refresh();
  }

  /**
   * Applies a new state.
   *
   * @param state Composer state.
   */
  stateSet(state: ComposerCollaborationChatState): void {
    this.state = state;
    this.refresh();
  }

  /**
   * Returns whether the current text could be sent now.
   *
   * @returns True when Send is active.
   */
  canSend(): boolean {
    const state = this.state;
    if (!state.enabled || state.sending || state.remainingMs > 0) return false;
    const text = chatTextClean(this.field.value);
    return text !== '' && chatTextLength(text) <= state.lengthMaximum && chatTextLines(text) <= state.linesMaximum;
  }

  /**
   * Shows why the last message was refused; an empty text hides the line.
   *
   * @param text Explanation.
   */
  noticeSet(text: string): void {
    this.notice.textContent = text;
    this.notice.style.display = text === '' ? 'none' : 'block';
  }

  /** Empties the field after the relay accepted the message. */
  clear(): void {
    this.field.value = '';
    this.refresh();
  }

  /** Puts the caret into the field. */
  focus(): void {
    if (!this.field.disabled) this.field.focus();
  }

  /** Sends the text when allowed. */
  submit(): void {
    if (!this.canSend()) return;
    this.picker.openSet(false);
    this.onSend(this.field.value);
  }

  /**
   * Handles Enter and Escape inside the field.
   *
   * @param event Key event.
   */
  private keyHandle(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === 'Escape' && this.picker.isOpen()) {
      event.preventDefault();
      return this.picker.openSet(false);
    }
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    this.submit();
  }

  /** Updates the button, counter, placeholder and field height. */
  private refresh(): void {
    const state = this.state;
    this.field.disabled = !state.enabled;
    this.field.placeholder = state.placeholder;
    this.sendButton.disabled = !this.canSend();
    this.sendButton.style.opacity = this.sendButton.disabled ? '0.45' : '1';
    this.sendButton.style.cursor = this.sendButton.disabled ? 'default' : 'pointer';
    this.sendButton.textContent = composerCollaborationChatSendLabel(state);
    this.emojiButton.disabled = !state.enabled;
    this.counterUpdate();
    this.field.style.height = 'auto';
    this.field.style.height = `${Math.min(120, Math.max(36, this.field.scrollHeight))}px`;
  }

  /** Shows the characters left when close to or over the limit. */
  private counterUpdate(): void {
    const text = chatTextClean(this.field.value);
    const left = this.state.lengthMaximum - chatTextLength(text);
    const linesOver = chatTextLines(text) > this.state.linesMaximum;
    this.counter.textContent = linesOver ? `Too many lines (max ${this.state.linesMaximum})` : String(left);
    this.counter.style.display = linesOver || left <= COMPOSER_COLLABORATION_CHAT_COUNTER_FROM ? 'block' : 'none';
    this.counter.style.color = linesOver || left < 0 ? '#ff6b6b' : Theme.statusBarTextColor;
  }

  /**
   * Arranges the field and buttons.
   *
   * @returns Composer element.
   */
  private layout(): HTMLElement {
    const element = document.createElement('div');
    element.className = 'editor-chat-composer';
    element.style.cssText =
      'position:relative;flex:0 0 auto;padding:8px 10px 10px;border-top:1px solid rgba(255,255,255,0.07)';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:flex-end;gap:6px';
    row.append(this.field, this.emojiButton, this.sendButton);
    element.append(this.picker.element, this.notice, row, this.counter);
    return element;
  }
}

/**
 * Returns the state before the window knows the room.
 *
 * @returns Disabled state.
 */
export function composerCollaborationChatStateIdle(): ComposerCollaborationChatState {
  return {
    enabled: false,
    remainingMs: 0,
    sending: false,
    lengthMaximum: 2000,
    linesMaximum: 20,
    placeholder: 'Join a room to chat',
  };
}

/**
 * Returns the Send button caption: the seconds left while waiting.
 *
 * @param state Composer state.
 * @returns Caption.
 */
export function composerCollaborationChatSendLabel(state: ComposerCollaborationChatState): string {
  if (state.sending) return 'Sending\u2026';
  if (state.enabled && state.remainingMs > 0) return `${Math.ceil(state.remainingMs / 1000)}s`;
  return 'Send';
}

/**
 * Creates the message field.
 *
 * @returns Text area.
 */
function composerCollaborationChatField(): HTMLTextAreaElement {
  const field = document.createElement('textarea');
  field.className = 'editor-chat-field';
  field.rows = 1;
  field.spellcheck = true;
  field.autocomplete = 'off';
  field.name = 'aiworlded-chat-message';
  field.setAttribute('aria-label', 'Chat message');
  field.setAttribute('data-1p-ignore', '');
  field.setAttribute('data-lpignore', 'true');
  field.style.cssText = `flex:1 1 auto;min-width:0;resize:none;box-sizing:border-box;height:36px;max-height:120px;padding:8px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.14);background:rgba(0,0,0,0.35);color:#f0f0f0;font-size:13px;line-height:18px;font-family:${Theme.uiFontFamily}`;
  return field;
}

/**
 * Creates the emoji button.
 *
 * @param onClick Toggles the picker.
 * @returns Button.
 */
function composerCollaborationChatEmojiButton(onClick: () => void): HTMLButtonElement {
  const button = uiCollaborationButton('\u{1F642}', false, onClick);
  button.className = 'editor-chat-emoji-toggle';
  button.title = 'Emoji';
  button.setAttribute('aria-label', 'Emoji');
  button.style.minWidth = '36px';
  button.style.padding = '6px 8px';
  button.style.fontSize = '15px';
  button.addEventListener('mousedown', (event) => event.preventDefault());
  return button;
}

/**
 * Creates the characters left counter.
 *
 * @returns Counter element.
 */
function composerCollaborationChatCounter(): HTMLElement {
  const counter = document.createElement('div');
  counter.className = 'editor-chat-counter';
  counter.style.cssText = 'display:none;text-align:right;font-size:11px;margin-top:4px';
  return counter;
}

/**
 * Creates the line that explains a refused message.
 *
 * @returns Notice element.
 */
function composerCollaborationChatNotice(): HTMLElement {
  const notice = document.createElement('div');
  notice.className = 'editor-chat-notice';
  notice.setAttribute('role', 'alert');
  notice.style.cssText = 'display:none;font-size:11px;line-height:15px;margin-bottom:6px;color:#ffb070';
  return notice;
}
