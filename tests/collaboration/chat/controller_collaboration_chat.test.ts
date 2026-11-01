import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ControllerCollaborationChat,
  controllerCollaborationChatErrorText,
  type ControllerCollaborationChatLink,
} from '@/collaboration/chat/controller_collaboration_chat.js';
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
    limits: () => ({ ...SOCKET_COLLABORATION_LIMITS_DEFAULT, chatIntervalMs: 5000 }),
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
});
