import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CONTROLLER_COLLABORATION_CHAT_PRESENCE_PER_MINUTE,
  CONTROLLER_COLLABORATION_CHAT_EXPIRE_EVERY_MS,
  ControllerCollaborationChat,
  controllerCollaborationChatErrorText,
  type ControllerCollaborationChatLink,
} from '@/collaboration/chat/controller_collaboration_chat.js';
import { LOG_COLLABORATION_CHAT_AGE_MAXIMUM_MS } from '@/collaboration/chat/log_collaboration_chat.js';
import {
  SOCKET_COLLABORATION_LIMITS_DEFAULT,
  SocketCollaborationError,
  type SocketCollaborationMessage,
} from '@/collaboration/net/socket_collaboration_types.js';

/** Test chat with its fake relay. */
interface Fixture {
  chat: ControllerCollaborationChat;
  replies: Array<(reply: SocketCollaborationMessage | Error) => void>;
  sent: string[];
  statusBar: HTMLElement;
  clock: { now: number };
}

/**
 * Creates a chat whose relay answers when the test resolves a reply.
 *
 * @returns Fixture.
 */
function fixture(): Fixture {
  const container = document.createElement('div');
  const statusBar = document.createElement('div');
  statusBar.appendChild(document.createElement('div'));
  document.body.append(container, statusBar);
  const replies: Fixture['replies'] = [];
  const sent: string[] = [];
  const clock = { now: 1_000_000 };
  const link: ControllerCollaborationChatLink = {
    chatSend: (text) => {
      sent.push(text);
      return new Promise((resolve, reject) =>
        replies.push((reply) => (reply instanceof Error ? reject(reply) : resolve(reply))),
      );
    },
    chatShare: (file) => {
      sent.push(`file:${file.name}`);
      return new Promise((resolve, reject) =>
        replies.push((reply) => (reply instanceof Error ? reject(reply) : resolve(reply))),
      );
    },
    transferUrl: (link) => `https://relay.test/ws/transfer/${link}`,
    limits: () => ({ ...SOCKET_COLLABORATION_LIMITS_DEFAULT, chatIntervalMs: 5000 }),
    typingSend: () => undefined,
    typingNames: () => [],
  };
  const chat = new ControllerCollaborationChat({ container, statusBarElement: () => statusBar }, link, () => clock.now);
  return { chat, replies, sent, statusBar, clock };
}

/**
 * Builds a relay chat message.
 *
 * @param id Relay id.
 * @param from Sender.
 * @param text Text.
 * @param kind Message type.
 * @returns Message.
 */
function message(id: number, from: number, text: string, kind: string = 'chat'): SocketCollaborationMessage {
  return { t: kind, id, from, name: from === 1 ? 'Henry' : 'Henry2', color: from, text, at: 1_000_000 };
}

/**
 * Builds a relay chat message at an explicit time.
 *
 * @param id Relay id.
 * @param from Sender.
 * @param text Text.
 * @param at Epoch ms.
 * @returns Message.
 */
function messageAt(id: number, from: number, text: string, at: number): SocketCollaborationMessage {
  return { ...message(id, from, text), at };
}

/** Lets pending promise callbacks run. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

/** Chat controller: room lifecycle, notifications, sending and refusals. */
describe('controller_collaboration_chat', () => {
  it('ignores chat outside a room and shows the button only in one', () => {
    const { chat, statusBar } = fixture();
    chat.received(message(1, 2, 'early'));
    expect(chat.panel.list.entries()).toEqual([]);
    const button = statusBar.querySelector<HTMLElement>('.editor-chat-button');
    expect(button?.style.display).toBe('none');
    chat.roomEntered('Lobby');
    expect(button?.style.display).toBe('inline-flex');
    const label = button?.querySelector<HTMLElement>('.editor-status-bar-label');
    expect(label?.textContent).toBe('\u{1F4AC} Chat');
    expect(label?.style.fontSize).toBe('11px');
    expect(label?.style.fontFamily).toBe('monospace');
    expect(chat.panel.composer.field.placeholder).toBe('Message Lobby');
    chat.dispose();
  });

  it('notifies and counts unread messages while the window is closed', () => {
    const { chat, statusBar } = fixture();
    chat.roomEntered('Lobby');
    chat.received(message(1, 2, 'hi'));
    chat.received(message(2, 2, 'there'));
    expect(chat.unreadCount()).toBe(2);
    expect(statusBar.querySelector('.editor-chat-badge')?.textContent).toBe('2');
    expect(document.querySelector('.editor-chat-toast-title')?.textContent).toBe('2 new messages from Henry2');
    chat.toast.element.click();
    expect(chat.panel.isOpen()).toBe(true);
    expect(chat.unreadCount()).toBe(0);
    expect(chat.toast.isShown()).toBe(false);
    chat.received(message(3, 2, 'open now'));
    expect(chat.unreadCount()).toBe(0);
    expect(chat.panel.list.entries().length).toBe(3);
    chat.dispose();
  });

  it('keeps the text until the relay accepts it, then cools down', async () => {
    vi.useFakeTimers();
    const { chat, replies, sent, clock } = fixture();
    chat.roomEntered('Lobby');
    chat.open();
    const composer = chat.panel.composer;
    composer.field.value = 'hello';
    composer.field.dispatchEvent(new Event('input'));
    composer.submit();
    expect(sent).toEqual(['hello']);
    expect(composer.sendButton.textContent).toBe('Sending\u2026');
    composer.submit();
    expect(sent.length).toBe(1);
    replies[0]?.(message(7, 1, 'hello', 'chat.sent'));
    await settle();
    expect(composer.field.value).toBe('');
    expect(chat.panel.list.entries().map((entry) => entry.id)).toEqual([7]);
    expect(composer.sendButton.disabled).toBe(true);
    expect(composer.sendButton.textContent).toBe('5s');
    clock.now += 5000;
    vi.advanceTimersByTime(5000);
    composer.field.value = 'again';
    composer.field.dispatchEvent(new Event('input'));
    expect(composer.sendButton.disabled).toBe(false);
    chat.dispose();
  });

  it('waits for the relay retry time and explains a rate limit', async () => {
    const { chat, replies } = fixture();
    chat.roomEntered('Lobby');
    chat.panel.composer.field.value = 'spam';
    chat.panel.composer.submit();
    replies[0]?.(
      new SocketCollaborationError('chat_rate_limited', { t: 'error', code: 'chat_rate_limited', retryAfterMs: 2500 }),
    );
    await settle();
    expect(chat.cooldown.remaining(1_000_000)).toBe(2500);
    expect(chat.panel.composer.field.value).toBe('spam');
    expect(chat.panel.composer.notice.textContent).toContain('Slow down');
    chat.dispose();
  });

  it('forgets everything when the room ends', () => {
    const { chat } = fixture();
    chat.roomEntered('Lobby');
    chat.received(message(1, 2, 'hi'));
    chat.roomLeft();
    expect(chat.panel.list.entries()).toEqual([]);
    expect(chat.unreadCount()).toBe(0);
    expect(chat.toast.isShown()).toBe(false);
    expect(chat.panel.composer.field.disabled).toBe(true);
    chat.dispose();
  });

  it('explains every refusal', () => {
    const error = (code: string, reason?: string): SocketCollaborationError =>
      new SocketCollaborationError(code, { t: 'error', code, reason });
    expect(controllerCollaborationChatErrorText(error('invalid_chat', 'too_long'))).toContain('too long');
    expect(controllerCollaborationChatErrorText(error('invalid_chat', 'too_many_lines'))).toContain('too many lines');
    expect(controllerCollaborationChatErrorText(error('invalid_chat', 'empty'))).toContain('empty');
    expect(controllerCollaborationChatErrorText(error('not_in_room'))).toContain('not in a room');
    expect(controllerCollaborationChatErrorText(new Error('closed'))).toContain('connection');
  });
  it('shares a file as a chat message with its download URL and keeps the typed text', async () => {
    const { chat, replies, sent } = fixture();
    chat.roomEntered('Lobby');
    chat.open();
    chat.panel.composer.field.value = 'draft';
    void chat.share(new File(['abc'], 'notes.txt', { type: 'text/plain' }));
    expect(sent).toEqual(['file:notes.txt']);
    const link = 'a'.repeat(43);
    const file = { link, name: 'notes.txt', size: 3, mime: 'text/plain' };
    replies[0]?.({ ...message(9, 1, 'notes.txt', 'chat.sent'), file });
    await settle();
    expect(chat.panel.composer.field.value).toBe('draft');
    expect(chat.panel.list.entries()[0]?.file?.url).toBe(`https://relay.test/ws/transfer/${link}`);
    expect(document.querySelector('.editor-chat-file-box .editor-chat-file-size')?.textContent).toBe('3 B');
    chat.dispose();
  });

  it('explains a refused file share', async () => {
    const { chat, replies } = fixture();
    chat.roomEntered('Lobby');
    void chat.share(new File(['abc'], 'a.bin'));
    replies[0]?.(new SocketCollaborationError('transfer_unavailable', { t: 'error', code: 'transfer_unavailable' }));
    await settle();
    expect(chat.panel.composer.notice.textContent).toBe('This server cannot share files.');
    chat.dispose();
  });

  it('clears closed-chat unread when the only unread message expires', () => {
    vi.useFakeTimers();
    const { chat, statusBar, clock } = fixture();
    chat.roomEntered('Lobby');
    chat.received(messageAt(1, 2, 'hi', clock.now));
    expect(chat.unreadCount()).toBe(1);
    expect(statusBar.querySelector('.editor-chat-badge')?.textContent).toBe('1');
    clock.now += LOG_COLLABORATION_CHAT_AGE_MAXIMUM_MS + 1;
    vi.advanceTimersByTime(CONTROLLER_COLLABORATION_CHAT_EXPIRE_EVERY_MS);
    expect(chat.panel.list.entries()).toEqual([]);
    expect(chat.unreadCount()).toBe(0);
    expect(statusBar.querySelector<HTMLElement>('.editor-chat-badge')?.style.display).toBe('none');
    chat.dispose();
  });

  it('keeps only still-present unread ids after mixed read and unread expiry', () => {
    vi.useFakeTimers();
    const { chat, statusBar, clock } = fixture();
    chat.roomEntered('Lobby');
    chat.open();
    chat.received(messageAt(1, 2, 'seen', clock.now));
    chat.panel.hide(true);
    expect(chat.unreadCount()).toBe(0);
    chat.received(messageAt(2, 2, 'later', clock.now + 10));
    chat.received(messageAt(3, 2, 'newest', clock.now + 20));
    expect(chat.unreadCount()).toBe(2);
    clock.now += LOG_COLLABORATION_CHAT_AGE_MAXIMUM_MS + 15;
    vi.advanceTimersByTime(CONTROLLER_COLLABORATION_CHAT_EXPIRE_EVERY_MS);
    expect(chat.panel.list.entries().map((entry) => entry.id)).toEqual([3]);
    expect(chat.unreadCount()).toBe(1);
    expect(statusBar.querySelector('.editor-chat-badge')?.textContent).toBe('1');
    chat.dispose();
  });

  it('shows joined and left lines without unread, badge, notification or pill', () => {
    const { chat, statusBar } = fixture();
    chat.presenceReceived(5, 'Early', 1, true);
    expect(chat.panel.list.entries()).toEqual([]);
    chat.roomEntered('Lobby');
    chat.received(message(1, 2, 'hi'));
    chat.toast.dismiss();
    chat.presenceReceived(5, 'Ann', 3, true);
    chat.presenceReceived(5, 'Ann', 3, false);
    expect(chat.unreadCount()).toBe(1);
    expect(statusBar.querySelector('.editor-chat-badge')?.textContent).toBe('1');
    expect(chat.toast.isShown()).toBe(false);
    expect(chat.panel.list.unseenCount()).toBe(0);
    const rows = [...chat.panel.list.root.querySelectorAll<HTMLElement>('.editor-chat-row-presence')];
    expect(rows.map((row) => row.textContent?.replace(/\d{1,2}:\d{2}.*$/u, '').trim())).toEqual([
      '\u2192Ann joined the room.',
      '\u2190Ann left the room.',
    ]);
    expect(chat.panel.list.entries().map((entry) => entry.presence ?? entry.text)).toEqual(['hi', 'joined', 'left']);
    chat.dispose();
  });

  it('places a later message after the joined line and gives it its own header', () => {
    const { chat } = fixture();
    chat.roomEntered('Lobby');
    chat.panel.show();
    chat.received(message(1, 2, 'before'));
    chat.presenceReceived(2, 'Henry2', 2, true);
    chat.received(message(2, 2, 'after'));
    expect(chat.panel.list.entries().map((entry) => entry.presence ?? entry.text)).toEqual([
      'before',
      'joined',
      'after',
    ]);
    const last = [...chat.panel.list.root.querySelectorAll<HTMLElement>('.editor-chat-row')].at(-1);
    expect(last?.classList.contains('editor-chat-row-first')).toBe(true);
    chat.dispose();
  });

  it('shows the name as plain text', () => {
    const { chat } = fixture();
    chat.roomEntered('Lobby');
    chat.presenceReceived(5, '<img src=x onerror=alert(1)>', 3, true);
    const name = chat.panel.list.root.querySelector('.editor-chat-presence-name');
    expect(name?.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(chat.panel.list.root.querySelector('.editor-chat-row-presence img')).toBeNull();
    chat.dispose();
  });

  it('skips joined and left lines beyond the per-minute limit', () => {
    const { chat, clock } = fixture();
    chat.roomEntered('Lobby');
    for (let index = 0; index < CONTROLLER_COLLABORATION_CHAT_PRESENCE_PER_MINUTE + 5; index += 1)
      chat.presenceReceived(index, `Guest${index}`, index, index % 2 === 0);
    expect(chat.panel.list.entries()).toHaveLength(CONTROLLER_COLLABORATION_CHAT_PRESENCE_PER_MINUTE);
    clock.now += 60_000;
    chat.presenceReceived(99, 'Later', 1, true);
    expect(chat.panel.list.entries()).toHaveLength(CONTROLLER_COLLABORATION_CHAT_PRESENCE_PER_MINUTE + 1);
    chat.dispose();
  });
});
