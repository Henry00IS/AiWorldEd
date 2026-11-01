import { describe, expect, it } from 'vitest';
import type { EntryCollaborationChat } from '@/collaboration/chat/entry_collaboration_chat.js';
import { ListCollaborationChat } from '@/collaboration/chat/list_collaboration_chat.js';
import { LOG_COLLABORATION_CHAT_AGE_MAXIMUM_MS } from '@/collaboration/chat/log_collaboration_chat.js';

/** Fake scroll geometry, since jsdom has no layout; every row adds 50 px. */
interface Geometry {
  height: number;
  top: number;
  client: number;
}

/**
 * Builds a chat entry.
 *
 * @param id Relay id.
 * @param from Sender.
 * @param at Time (epoch ms).
 * @returns Entry.
 */
function entry(id: number, from: number, at: number): EntryCollaborationChat {
  return { id, from, name: `User${from}`, color: from, text: `message ${id}`, at };
}

/**
 * Gives a list a controllable scroll geometry.
 *
 * @param list Chat list.
 * @returns Geometry object read by the scroller.
 */
function geometry(list: ListCollaborationChat): Geometry {
  const state: Geometry = { height: 1000, top: 800, client: 200 };
  const height = (): number => state.height + list.scroller.children.length * 50;
  Object.defineProperty(list.scroller, 'scrollHeight', { get: height });
  Object.defineProperty(list.scroller, 'clientHeight', { get: () => state.client });
  Object.defineProperty(list.scroller, 'scrollTop', {
    get: () => state.top,
    set: (value: number) => (state.top = Math.min(value, height() - state.client)),
  });
  return state;
}

/**
 * Returns the class of every row.
 *
 * @param list Chat list.
 * @returns Row kinds.
 */
function kinds(list: ListCollaborationChat): string[] {
  return Array.from(list.scroller.children, (row) => (row.classList.contains('editor-chat-row-grouped') ? 'g' : 'F'));
}

/** Message list: grouping, follow-at-bottom, pill, cap and expiry. */
describe('list_collaboration_chat', () => {
  it('groups one sender and leaves a gap when the sender changes', () => {
    const list = new ListCollaborationChat(() => 0);
    [entry(1, 1, 0), entry(2, 1, 1000), entry(3, 2, 2000), entry(4, 1, 3000), entry(5, 1, 4000)].forEach((item) =>
      list.add(item),
    );
    expect(kinds(list)).toEqual(['F', 'g', 'F', 'F', 'g']);
  });

  it('regroups when a message arrives out of order', () => {
    const list = new ListCollaborationChat(() => 0);
    list.add(entry(1, 1, 0));
    list.add(entry(3, 1, 2000));
    list.add(entry(2, 2, 1000));
    expect(kinds(list)).toEqual(['F', 'F', 'F']);
    expect(Array.from(list.scroller.children, (row) => (row as HTMLElement).dataset['chatId'])).toEqual([
      '1',
      '2',
      '3',
    ]);
  });

  it('follows new messages at the bottom', () => {
    const list = new ListCollaborationChat(() => 0);
    const state = geometry(list);
    list.add(entry(1, 1, 0));
    list.add(entry(2, 2, 0));
    expect(state.top).toBe(900);
    expect(list.unseenCount()).toBe(0);
    expect(list.pill.style.display).toBe('none');
  });

  it('shows the pill instead of scrolling when scrolled up', () => {
    const list = new ListCollaborationChat(() => 0);
    const state = geometry(list);
    state.top = 100;
    list.add(entry(1, 1, 0));
    list.add(entry(2, 1, 0));
    expect(state.top).toBe(100);
    expect(list.unseenCount()).toBe(2);
    expect(list.pill.style.display).toBe('block');
    expect(list.pill.textContent).toContain('2 new messages');
    list.add(entry(3, 1, 0), true);
    expect(state.top).toBe(950);
    expect(list.pill.style.display).toBe('none');
  });

  it('hides the pill after scrolling down', () => {
    const list = new ListCollaborationChat(() => 0);
    const state = geometry(list);
    state.top = 0;
    list.add(entry(1, 1, 0));
    state.top = 850;
    list.scroller.dispatchEvent(new Event('scroll'));
    expect(list.unseenCount()).toBe(0);
  });

  it('caps the rows and regroups the new first row', () => {
    const list = new ListCollaborationChat(() => 0, 3);
    [1, 2, 3, 4, 5].forEach((id) => list.add(entry(id, 1, id)));
    expect(list.scroller.children.length).toBe(3);
    expect(kinds(list)).toEqual(['F', 'g', 'g']);
    expect(list.entries().map((item) => item.id)).toEqual([3, 4, 5]);
  });

  it('removes messages older than an hour and their rows', () => {
    let now = 0;
    const list = new ListCollaborationChat(() => now);
    list.add(entry(1, 1, 0));
    list.add(entry(2, 1, 60_000));
    now = LOG_COLLABORATION_CHAT_AGE_MAXIMUM_MS + 1000;
    expect(list.expire()).toBe(1);
    expect(list.scroller.children.length).toBe(1);
    expect(kinds(list)).toEqual(['F']);
    list.clear();
    expect(list.scroller.children.length).toBe(0);
  });
});
