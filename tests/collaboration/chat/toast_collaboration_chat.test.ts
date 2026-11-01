import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EntryCollaborationChat } from '@/collaboration/chat/entry_collaboration_chat.js';
import {
  ToastCollaborationChat,
  toastCollaborationChatPreview,
  toastCollaborationChatSenders,
} from '@/collaboration/chat/toast_collaboration_chat.js';

/**
 * Builds a chat entry.
 *
 * @param id Relay id.
 * @param name Sender name.
 * @param text Text.
 * @returns Entry.
 */
function entry(id: number, name: string, text: string): EntryCollaborationChat {
  return { id, from: id, name, color: 1, text, at: 0 };
}

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

/** Notification while the chat window is closed. */
describe('toast_collaboration_chat', () => {
  it('shortens previews to one line', () => {
    expect(toastCollaborationChatPreview('a\n\nb')).toBe('a b');
    expect(toastCollaborationChatPreview('x'.repeat(200), 10)).toBe(`${'x'.repeat(9)}\u2026`);
    expect(toastCollaborationChatSenders(['A', 'B'])).toBe('A and B');
    expect(toastCollaborationChatSenders(['A', 'B', 'C', 'D'])).toBe('A, B and 2 others');
  });

  it('shows the sender and a text-only preview', () => {
    const toast = new ToastCollaborationChat(() => {});
    toast.notify(entry(1, 'Henry', '<img src=x onerror=alert(1)>'));
    const element = document.querySelector('.editor-chat-toast');
    expect(element?.querySelector('.editor-chat-toast-title')?.textContent).toBe('Henry');
    expect(element?.querySelector('.editor-chat-toast-preview')?.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(element?.querySelector('img')).toBeNull();
  });

  it('merges a burst into one notification', () => {
    const toast = new ToastCollaborationChat(() => {});
    toast.notify(entry(1, 'Henry', 'one'));
    toast.notify(entry(2, 'Ann', 'two'));
    toast.notify(entry(3, 'Henry', 'three'));
    expect(document.querySelectorAll('.editor-chat-toast').length).toBe(1);
    expect(document.querySelector('.editor-chat-toast-title')?.textContent).toBe('3 new messages from Henry and Ann');
    expect(document.querySelector('.editor-chat-toast-preview')?.textContent).toBe('Henry: three');
  });

  it('hides itself after a while and opens the chat on click', () => {
    vi.useFakeTimers();
    const open = vi.fn();
    const toast = new ToastCollaborationChat(open, 1000);
    toast.notify(entry(1, 'Henry', 'one'));
    vi.advanceTimersByTime(999);
    expect(toast.isShown()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(toast.isShown()).toBe(false);
    toast.notify(entry(2, 'Henry', 'two'));
    expect(document.querySelector('.editor-chat-toast-title')?.textContent).toBe('Henry');
    toast.element.click();
    expect(open).toHaveBeenCalledOnce();
    expect(toast.isShown()).toBe(false);
  });
});
