import { describe, expect, it, vi } from 'vitest';
import {
  ComposerCollaborationChat,
  composerCollaborationChatStateIdle,
  type ComposerCollaborationChatState,
} from '@/collaboration/chat/composer_collaboration_chat.js';
import { EMOJI_COLLABORATION_CHAT_SET } from '@/collaboration/chat/emoji_collaboration_chat.js';

/**
 * Returns a composer state.
 *
 * @param change Fields that differ from an open, ready room chat.
 * @returns State.
 */
function state(change: Partial<ComposerCollaborationChatState> = {}): ComposerCollaborationChatState {
  return { ...composerCollaborationChatStateIdle(), enabled: true, placeholder: 'Message room', ...change };
}

/**
 * Creates a composer in the document.
 *
 * @returns Composer and its send spy.
 */
function composer(): { composer: ComposerCollaborationChat; send: ReturnType<typeof vi.fn> } {
  const send = vi.fn();
  const created = new ComposerCollaborationChat(send);
  document.body.appendChild(created.element);
  return { composer: created, send };
}

/**
 * Presses Enter in the field.
 *
 * @param field Message field.
 * @param shiftKey True for Shift+Enter.
 * @returns The dispatched event.
 */
function enter(field: HTMLTextAreaElement, shiftKey: boolean = false): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey, bubbles: true, cancelable: true });
  field.dispatchEvent(event);
  return event;
}

/** Composer: Enter, cooldown, limits and the emoji grid. */
describe('composer_collaboration_chat', () => {
  it('sends on Enter and adds a line on Shift+Enter', () => {
    const { composer: created, send } = composer();
    created.stateSet(state());
    created.field.value = 'hello';
    expect(enter(created.field, true).defaultPrevented).toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(enter(created.field).defaultPrevented).toBe(true);
    expect(send).toHaveBeenCalledWith('hello');
  });

  it('grays out Send and ignores Enter during the cooldown', () => {
    const { composer: created, send } = composer();
    created.field.value = 'hello';
    created.stateSet(state({ remainingMs: 3200 }));
    expect(created.sendButton.disabled).toBe(true);
    expect(created.sendButton.textContent).toBe('4s');
    expect(created.sendButton.style.opacity).toBe('0.45');
    enter(created.field);
    created.sendButton.click();
    expect(send).not.toHaveBeenCalled();
    expect(created.field.value).toBe('hello');
    created.stateSet(state({ sending: true }));
    expect(created.sendButton.disabled).toBe(true);
    created.stateSet(state());
    expect(created.sendButton.disabled).toBe(false);
    expect(created.sendButton.textContent).toBe('Send');
  });

  it('refuses empty, too long and too tall messages', () => {
    const { composer: created } = composer();
    created.stateSet(state({ lengthMaximum: 10, linesMaximum: 2 }));
    created.field.value = ' \u200B\u202E ';
    expect(created.canSend()).toBe(false);
    created.field.value = 'x'.repeat(11);
    created.field.dispatchEvent(new Event('input'));
    expect(created.canSend()).toBe(false);
    expect(created.counter.textContent).toBe('-1');
    created.field.value = 'a\nb\nc';
    expect(created.canSend()).toBe(false);
    created.field.value = '\u{1F600}'.repeat(10);
    expect(created.canSend()).toBe(true);
  });

  it('disables the field outside a room', () => {
    const { composer: created } = composer();
    expect(created.field.disabled).toBe(true);
    expect(created.field.placeholder).toBe('Join a room to chat');
  });

  it('inserts an emoji at the caret', () => {
    const { composer: created } = composer();
    created.stateSet(state());
    created.field.value = 'ab';
    created.field.setSelectionRange(1, 1);
    created.emojiButton.click();
    expect(created.picker.isOpen()).toBe(true);
    const cell = created.picker.element.querySelector('button');
    cell?.click();
    expect(created.field.value).toBe(`a${EMOJI_COLLABORATION_CHAT_SET[0]}b`);
    expect(created.field.selectionStart).toBe(1 + (EMOJI_COLLABORATION_CHAT_SET[0] ?? '').length);
  });

  it('shows and hides the refusal notice as text', () => {
    const { composer: created } = composer();
    created.noticeSet('<b>slow</b>');
    expect(created.notice.textContent).toBe('<b>slow</b>');
    expect(created.notice.children.length).toBe(0);
    created.noticeSet('');
    expect(created.notice.style.display).toBe('none');
  });
});
