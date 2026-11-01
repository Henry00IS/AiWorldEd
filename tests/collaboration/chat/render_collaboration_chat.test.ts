import { afterEach, describe, expect, it } from 'vitest';
import type { EntryCollaborationChat } from '@/collaboration/chat/entry_collaboration_chat.js';
import {
  renderCollaborationChatInitials,
  renderCollaborationChatRow,
  renderCollaborationChatTime,
} from '@/collaboration/chat/render_collaboration_chat.js';

const HOSTILE = [
  '<script>window.chatOwned = 1</script>',
  '<img src=x onerror="window.chatOwned = 1">',
  '\u202Eevil\u202C text with RTL override',
  'zero\u200Bwidth\u200D\uFEFFjoiners',
  '&lt;b&gt;entity&lt;/b&gt;',
];

/**
 * Builds a chat entry.
 *
 * @param text Message text.
 * @param name Sender name.
 * @returns Entry.
 */
function entry(text: string, name: string = 'Henry'): EntryCollaborationChat {
  return { id: 1, from: 2, name, color: 0, text, at: Date.now() };
}

afterEach(() => {
  document.body.innerHTML = '';
  Reflect.deleteProperty(window, 'chatOwned');
});

/** Message rendering: plain text only, initials and times. */
describe('render_collaboration_chat', () => {
  it.each(HOSTILE)('shows %j as text and never as markup', (text) => {
    const row = renderCollaborationChatRow(entry(text, text), false, Date.now());
    document.body.appendChild(row);
    const body = row.querySelector('.editor-chat-text');
    const name = row.querySelector('.editor-chat-name');
    expect(body?.textContent).toBe(text);
    expect(body?.children.length).toBe(0);
    expect(name?.textContent).toBe(text);
    expect(name?.children.length).toBe(0);
    expect(row.querySelector('script, img, b')).toBeNull();
    expect(Reflect.get(window, 'chatOwned')).toBeUndefined();
  });

  it('isolates the direction of names and text', () => {
    const row = renderCollaborationChatRow(entry('\u202Eabc'), false, Date.now());
    const body = row.querySelector<HTMLElement>('.editor-chat-text');
    expect(body?.dir).toBe('auto');
    expect(body?.style.unicodeBidi).toBe('isolate');
  });

  it('draws avatar and header only at the start of a group', () => {
    const first = renderCollaborationChatRow(entry('a'), false, Date.now());
    const grouped = renderCollaborationChatRow(entry('b'), true, Date.now());
    expect(first.querySelector('.editor-chat-avatar')?.textContent).toBe('He');
    expect(first.querySelector('.editor-chat-header')).not.toBeNull();
    expect(first.style.marginTop).toBe('14px');
    expect(grouped.querySelector('.editor-chat-avatar, .editor-chat-header')).toBeNull();
    expect(grouped.style.marginTop).toBe('0px');
  });

  it('derives two-character initials', () => {
    expect(renderCollaborationChatInitials('Henry')).toBe('He');
    expect(renderCollaborationChatInitials('Henry2')).toBe('H2');
    expect(renderCollaborationChatInitials('HenryHenryH2')).toBe('H2');
    expect(renderCollaborationChatInitials('42')).toBe('42');
    expect(renderCollaborationChatInitials('ann lee')).toBe('AL');
    expect(renderCollaborationChatInitials('x')).toBe('X');
    expect(renderCollaborationChatInitials('\u{1F600}\u{1F601}')).toBe('\u{1F600}\u{1F601}');
  });

  it('adds the date only for other days', () => {
    const now = new Date(2026, 10, 1, 12, 0).getTime();
    const today = renderCollaborationChatTime(new Date(2026, 10, 1, 9, 5).getTime(), now);
    const earlier = renderCollaborationChatTime(new Date(2026, 9, 30, 9, 5).getTime(), now);
    expect(today).toMatch(/09.05/u);
    expect(earlier.length).toBeGreaterThan(today.length);
  });
});
