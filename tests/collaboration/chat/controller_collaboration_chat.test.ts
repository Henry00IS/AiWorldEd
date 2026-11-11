import { afterEach, describe, expect, it, vi } from 'vitest';
import {
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
    chatEdit: (id, text) => {
      sent.push(`edit:${id}:${text}`);
      return new Promise((resolve, reject) =>
        replies.push((reply) => (reply instanceof Error ? reject(reply) : resolve(reply))),
      );
    },
    chatEditAvailable: () => true,
    user: () => 1,
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
});

/**
 * Builds a relay chat edit.
 *
 * @param id Edited message id.
 * @param from Editor.
 * @param text New text.
 * @returns Message.
 */
function edited(id: number, from: number, text: string): SocketCollaborationMessage {
  return { t: 'chat.edited', id, from, text, at: 1_000_500 };
}

/**
 * Sends an own message and lets the relay accept it.
 *
 * @param fixture Test chat.
 * @param id Relay id of the accepted message.
 * @param text Text.
 */
async function sendOwn(fixture: Fixture, id: number, text: string): Promise<void> {
  fixture.chat.panel.composer.field.value = text;
  fixture.chat.panel.composer.submit();
  fixture.replies.at(-1)?.(message(id, 1, text, 'chat.sent'));
  await settle();
}

/**
 * Presses a key in a field.
 *
 * @param field Field.
 * @param key Key name.
 * @param init Extra key event fields.
 */
function press(field: HTMLElement, key: string, init: KeyboardEventInit = {}): void {
  field.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
}

/** Editing own messages and checking edits of others. */
describe('controller_collaboration_chat edits', () => {
  it('edits the newest own message on Up in an empty field and saves on Enter', async () => {
    const test = fixture();
    test.chat.roomEntered('Lobby');
    test.chat.open();
    await sendOwn(test, 3, 'helo');
    test.chat.received(message(4, 2, 'reply'));
    press(test.chat.panel.composer.field, 'ArrowUp');
    const field = document.querySelector<HTMLTextAreaElement>('.editor-chat-edit-field');
    expect(field?.value).toBe('helo');
    expect(document.activeElement).toBe(field);
    if (field === null) throw new Error('no edit field');
    field.value = 'hello';
    press(field, 'Enter');
    expect(test.sent.at(-1)).toBe('edit:3:hello');
    test.replies.at(-1)?.(edited(3, 1, 'hello'));
    await settle();
    expect(document.querySelector('.editor-chat-edit')).toBeNull();
    const row = document.querySelector('[data-chat-id="3"]');
    expect(row?.querySelector('.editor-chat-text')?.textContent).toBe('hello (edited)');
    expect(test.chat.panel.list.entry(3)?.edits).toBe(1);
    test.chat.dispose();
  });

  it('cancels on Escape and does not take Up while the field has text', async () => {
    const test = fixture();
    test.chat.roomEntered('Lobby');
    test.chat.open();
    await sendOwn(test, 3, 'helo');
    test.chat.panel.composer.field.value = 'draft';
    press(test.chat.panel.composer.field, 'ArrowUp');
    expect(document.querySelector('.editor-chat-edit')).toBeNull();
    test.chat.panel.composer.field.value = '';
    press(test.chat.panel.composer.field, 'ArrowUp');
    const field = document.querySelector<HTMLTextAreaElement>('.editor-chat-edit-field');
    if (field === null) throw new Error('no edit field');
    field.value = 'changed';
    press(field, 'Escape');
    expect(document.querySelector('.editor-chat-edit')).toBeNull();
    expect(test.sent.filter((text) => text.startsWith('edit:'))).toEqual([]);
    expect(document.querySelector('[data-chat-id="3"] .editor-chat-text')?.textContent).toBe('helo');
    test.chat.dispose();
  });

  it('offers Edit only on own text messages for five minutes', async () => {
    const test = fixture();
    test.chat.roomEntered('Lobby');
    test.chat.open();
    await sendOwn(test, 3, 'mine');
    test.chat.received(message(4, 2, 'theirs'));
    const action = test.chat.edit.action();
    const own = test.chat.panel.list.entry(3);
    const theirs = test.chat.panel.list.entry(4);
    if (own === undefined || theirs === undefined) throw new Error('missing');
    expect(action.label).toBe('Edit');
    expect(action.shown(own)).toBe(true);
    expect(action.shown(theirs)).toBe(false);
    test.clock.now += 5 * 60 * 1000;
    expect(action.shown(own)).toBe(false);
    press(test.chat.panel.composer.field, 'ArrowUp');
    expect(document.querySelector('.editor-chat-edit')).toBeNull();
    test.chat.dispose();
  });

  it('shows the Edit button on hover of an own message', async () => {
    const test = fixture();
    test.chat.roomEntered('Lobby');
    test.chat.open();
    await sendOwn(test, 3, 'mine');
    const row = document.querySelector('[data-chat-id="3"]');
    row?.dispatchEvent(new MouseEvent('mouseenter'));
    const button = row?.querySelector<HTMLButtonElement>('.editor-chat-action');
    expect(button?.title).toBe('Edit');
    button?.click();
    expect(row?.isConnected).toBe(false);
    expect(document.querySelector<HTMLTextAreaElement>('.editor-chat-edit-field')?.value).toBe('mine');
    test.chat.dispose();
  });

  it('keeps the editor open and explains a refused edit', async () => {
    const test = fixture();
    test.chat.roomEntered('Lobby');
    test.chat.open();
    await sendOwn(test, 3, 'helo');
    press(test.chat.panel.composer.field, 'ArrowUp');
    const field = document.querySelector<HTMLTextAreaElement>('.editor-chat-edit-field');
    if (field === null) throw new Error('no edit field');
    field.value = 'hello';
    press(field, 'Enter');
    const code = 'chat_edit_refused';
    test.replies.at(-1)?.(new SocketCollaborationError(code, { t: 'error', code, reason: 'expired' }));
    await settle();
    expect(document.querySelector('.editor-chat-edit-notice')?.textContent).toBe(
      'This message can no longer be edited.',
    );
    expect(field.disabled).toBe(false);
    test.chat.dispose();
  });

  it('applies an edit by the author and rejects forged, late and excess edits', () => {
    const test = fixture();
    test.chat.roomEntered('Lobby');
    test.chat.received(message(4, 2, 'helo'));
    test.chat.editedReceived(edited(4, 3, 'forged'));
    expect(test.chat.panel.list.entry(4)?.text).toBe('helo');
    test.chat.editedReceived(edited(4, 2, 'hello'));
    expect(test.chat.panel.list.entry(4)?.text).toBe('hello');
    for (let count = 0; count < 30; count += 1) test.chat.editedReceived(edited(4, 2, `spam ${count}`));
    expect(test.chat.panel.list.entry(4)?.text).toBe('spam 18');
    test.chat.received(message(5, 2, 'later'));
    test.clock.now += 6 * 60 * 1000;
    test.chat.editedReceived(edited(5, 2, 'too late'));
    expect(test.chat.panel.list.entry(5)?.text).toBe('later');
    expect(test.chat.unreadCount()).toBe(2);
    test.chat.dispose();
  });

  it('shows edited text as plain text', () => {
    const test = fixture();
    test.chat.roomEntered('Lobby');
    test.chat.open();
    test.chat.received(message(4, 2, 'helo'));
    test.chat.editedReceived(edited(4, 2, '<img src=x onerror=alert(1)>'));
    const text = document.querySelector('[data-chat-id="4"] .editor-chat-text');
    expect(text?.querySelector('img')).toBeNull();
    expect(text?.textContent).toBe('<img src=x onerror=alert(1)> (edited)');
    test.chat.dispose();
  });
});
