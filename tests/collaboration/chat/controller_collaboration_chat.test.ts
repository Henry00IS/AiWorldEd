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
import { UserIdle } from '@/utils/user_idle.js';

/** Test chat with its fake relay. */
interface Fixture {
  chat: ControllerCollaborationChat;
  replies: Array<(reply: SocketCollaborationMessage | Error) => void>;
  sent: string[];
  statusBar: HTMLElement;
  clock: { now: number };
  idle: UserIdle;
  idleTarget: EventTarget;
  favicon: { unreadSet: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> };
  sound: { play: ReturnType<typeof vi.fn>; warm: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> };
}

/**
 * Creates a chat whose relay answers when the test resolves a reply.
 *
 * @returns Fixture.
 */
function fixture(options: { idle?: UserIdle } = {}): Fixture {
  const container = document.createElement('div');
  const statusBar = document.createElement('div');
  statusBar.appendChild(document.createElement('div'));
  document.body.append(container, statusBar);
  const replies: Fixture['replies'] = [];
  const sent: string[] = [];
  const clock = { now: 1_000_000 };
  const idleTarget = new EventTarget();
  const idle =
    options.idle ??
    new UserIdle({
      target: idleTarget,
      hidden: () => false,
      idleMs: Number.MAX_SAFE_INTEGER,
      now: () => clock.now,
    });
  const favicon = { unreadSet: vi.fn(), dispose: vi.fn() };
  const sound = { play: vi.fn(), warm: vi.fn(), dispose: vi.fn() };
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
    typingNames: (users) => users.flatMap((user) => (user === 3 ? ['Cat'] : [])),
    chatReact: (id, emoji, on) => {
      sent.push(`react:${id}:${emoji}:${on}`);
      return new Promise((resolve, reject) =>
        replies.push((reply) => (reply instanceof Error ? reject(reply) : resolve(reply))),
      );
    },
    chatEdit: (id, text) => {
      sent.push(`edit:${id}:${text}`);
      return new Promise((resolve, reject) =>
        replies.push((reply) => (reply instanceof Error ? reject(reply) : resolve(reply))),
      );
    },
    chatReactAvailable: () => true,
    chatEditAvailable: () => true,
    user: () => 1,
  };
  const chat = new ControllerCollaborationChat(
    { container, statusBarElement: () => statusBar },
    link,
    () => clock.now,
    {
      idle,
      favicon,
      sound,
    },
  );
  return { chat, replies, sent, statusBar, clock, idle, idleTarget, favicon, sound };
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

/**
 * Builds a relay reaction.
 *
 * @param id Message id.
 * @param from Reacting member.
 * @param emoji Emoji.
 * @param on True to add.
 * @returns Message.
 */
function reaction(id: number, from: number, emoji: string, on: boolean = true): SocketCollaborationMessage {
  return { t: 'chat.reaction', id, from, emoji, on };
}

/**
 * Returns the reaction pills of a message as "emoji count" pairs.
 *
 * @param id Message id.
 * @returns Pill texts.
 */
function pills(id: number): string[] {
  const row = document.querySelector(`[data-chat-id="${id}"]`);
  return [...(row?.querySelectorAll('.editor-chat-reaction') ?? [])].map((pill) => pill.textContent ?? '');
}

/** Emoji reactions on messages. */
describe('controller_collaboration_chat reactions', () => {
  it('adds a reaction from the hover toolbar picker once the relay accepts it', async () => {
    const test = fixture();
    test.chat.roomEntered('Lobby');
    test.chat.open();
    test.chat.received(message(4, 2, 'stairs'));
    const row = document.querySelector('[data-chat-id="4"]');
    row?.dispatchEvent(new MouseEvent('mouseenter'));
    const button = row?.querySelector<HTMLButtonElement>('.editor-chat-action');
    expect(button?.title).toBe('Add Reaction');
    button?.click();
    const cell = document.querySelector<HTMLButtonElement>('.editor-chat-react-host .editor-chat-emoji-cell');
    expect(document.querySelector<HTMLElement>('.editor-chat-react-host .editor-chat-emoji-host')?.style.display).toBe(
      'block',
    );
    cell?.click();
    const emoji = cell?.textContent ?? '';
    expect(test.sent.at(-1)).toBe(`react:4:${emoji}:true`);
    expect(pills(4)).toEqual([]);
    test.replies.at(-1)?.(reaction(4, 1, emoji));
    await settle();
    expect(pills(4)).toEqual([`${emoji}1`]);
    const pill = document.querySelector<HTMLButtonElement>('[data-chat-id="4"] .editor-chat-reaction');
    expect(pill?.getAttribute('aria-pressed')).toBe('true');
    expect(pill?.title).toBe(`You reacted with ${emoji}`);
    test.chat.dispose();
  });

  it('counts the reactions of others and toggles the own one with a click', async () => {
    const test = fixture();
    test.chat.roomEntered('Lobby');
    test.chat.open();
    test.chat.received(message(4, 2, 'stairs'));
    test.chat.reactionReceived(reaction(4, 3, '👍'));
    test.chat.reactionReceived(reaction(4, 2, '👍'));
    test.chat.reactionReceived(reaction(4, 2, '🎉'));
    expect(pills(4)).toEqual(['👍2', '🎉1']);
    const pill = document.querySelector<HTMLButtonElement>('[data-chat-id="4"] .editor-chat-reaction');
    expect(pill?.title).toBe('Cat and Henry2 reacted with 👍');
    pill?.click();
    expect(test.sent.at(-1)).toBe('react:4:👍:true');
    test.replies.at(-1)?.(reaction(4, 1, '👍'));
    await settle();
    expect(pills(4)).toEqual(['👍3', '🎉1']);
    document.querySelector<HTMLButtonElement>('[data-chat-id="4"] .editor-chat-reaction')?.click();
    expect(test.sent.at(-1)).toBe('react:4:👍:false');
    test.replies.at(-1)?.(reaction(4, 1, '👍', false));
    await settle();
    expect(pills(4)).toEqual(['👍2', '🎉1']);
    test.chat.dispose();
  });

  it('ignores malformed, unknown and flooding reactions and never counts them as unread', () => {
    const test = fixture();
    test.chat.roomEntered('Lobby');
    test.chat.received(message(4, 2, 'stairs'));
    test.chat.reactionReceived(reaction(4, 3, '<img src=x onerror=alert(1)>'));
    test.chat.reactionReceived(reaction(4, 3, '👍👍'));
    test.chat.reactionReceived(reaction(99, 3, '👍'));
    expect(test.chat.panel.list.entry(4)?.reactions).toBeUndefined();
    for (let count = 0; count < 50; count++) test.chat.reactionReceived(reaction(4, 3, '👍', count % 2 === 0));
    expect(test.chat.panel.list.entry(4)?.reactions?.has('👍')).toBe(false);
    test.clock.now += 10_000;
    test.chat.reactionReceived(reaction(4, 3, '👍'));
    expect(test.chat.panel.list.entry(4)?.reactions?.get('👍')?.size).toBe(1);
    expect(test.chat.unreadCount()).toBe(1);
    test.chat.dispose();
  });

  it('explains a refused reaction', async () => {
    const test = fixture();
    test.chat.roomEntered('Lobby');
    test.chat.received(message(4, 2, 'stairs'));
    const entry = test.chat.panel.list.entry(4);
    if (entry === undefined) throw new Error('missing');
    void test.chat.react.toggle(entry, '👍', true);
    const code = 'chat_rate_limited';
    test.replies.at(-1)?.(new SocketCollaborationError(code, { t: 'error', code, retryAfterMs: 900 }));
    await settle();
    expect(test.chat.panel.composer.notice.textContent).toBe('Slow down: too many reactions at once.');
    test.chat.dispose();
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

  it('returns focus to the message field after Enter or Escape, but not after a click', async () => {
    const test = fixture();
    test.chat.roomEntered('Lobby');
    test.chat.open();
    await sendOwn(test, 3, 'helo');
    const composer = test.chat.panel.composer.field;

    press(composer, 'ArrowUp');
    const field = document.querySelector<HTMLTextAreaElement>('.editor-chat-edit-field');
    if (field === null) throw new Error('no edit field');
    field.value = 'hello';
    press(field, 'Enter');
    test.replies.at(-1)?.(edited(3, 1, 'hello'));
    await settle();
    expect(document.querySelector('.editor-chat-edit')).toBeNull();
    expect(document.activeElement).toBe(composer);

    press(composer, 'ArrowUp');
    const again = document.querySelector<HTMLTextAreaElement>('.editor-chat-edit-field');
    if (again === null) throw new Error('no edit field');
    press(again, 'Escape');
    expect(document.querySelector('.editor-chat-edit')).toBeNull();
    expect(document.activeElement).toBe(composer);

    press(composer, 'ArrowUp');
    document.querySelector<HTMLButtonElement>('.editor-chat-edit-cancel')?.click();
    expect(document.querySelector('.editor-chat-edit')).toBeNull();
    expect(document.activeElement).not.toBe(composer);

    press(composer, 'ArrowUp');
    const last = document.querySelector<HTMLTextAreaElement>('.editor-chat-edit-field');
    if (last === null) throw new Error('no edit field');
    last.value = 'hello again';
    document.querySelector<HTMLButtonElement>('.editor-chat-edit-save')?.click();
    test.replies.at(-1)?.(edited(3, 1, 'hello again'));
    await settle();
    expect(document.querySelector('.editor-chat-edit')).toBeNull();
    expect(document.activeElement).not.toBe(composer);
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
    const button = row?.querySelector<HTMLButtonElement>('.editor-chat-action[title="Edit"]');
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

/** Edits, reactions and presence lines on the same list. */
describe('controller_collaboration_chat edits, reactions and presence lines', () => {
  it('offers no message actions on a presence line', () => {
    const test = fixture();
    test.chat.roomEntered('Lobby');
    test.chat.open();
    test.chat.received(message(4, 2, 'stairs'));
    test.chat.presenceReceived(3, 'Ann', 3, true);
    const line = document.querySelector('.editor-chat-row-presence');
    line?.dispatchEvent(new MouseEvent('mouseenter'));
    expect(line?.querySelector('.editor-chat-actions')).toBeNull();
    test.chat.dispose();
  });

  it('keeps reactions through an edit and takes reactions on an edited message', async () => {
    const test = fixture();
    test.chat.roomEntered('Lobby');
    test.chat.open();
    await sendOwn(test, 3, 'helo');
    test.chat.reactionReceived(reaction(3, 2, '👍'));
    press(test.chat.panel.composer.field, 'ArrowUp');
    const field = document.querySelector<HTMLTextAreaElement>('.editor-chat-edit-field');
    if (field === null) throw new Error('no edit field');
    field.value = 'hello';
    press(field, 'Enter');
    test.replies.at(-1)?.(edited(3, 1, 'hello'));
    await settle();
    expect(document.querySelector('[data-chat-id="3"] .editor-chat-text')?.textContent).toBe('hello (edited)');
    expect(pills(3)).toEqual(['👍1']);
    test.chat.reactionReceived(reaction(3, 3, '🎉'));
    expect(pills(3)).toEqual(['👍1', '🎉1']);
    expect(document.querySelector('[data-chat-id="3"] .editor-chat-text')?.textContent).toBe('hello (edited)');
    test.chat.dispose();
  });

  it('edits the own message right before a presence line and leaves the line alone', async () => {
    const test = fixture();
    test.chat.roomEntered('Lobby');
    test.chat.open();
    await sendOwn(test, 3, 'helo');
    test.chat.presenceReceived(3, 'Ann', 3, true);
    press(test.chat.panel.composer.field, 'ArrowUp');
    expect(document.querySelectorAll('.editor-chat-edit-field')).toHaveLength(1);
    expect(document.querySelector('.editor-chat-row-presence')?.textContent).toContain('Ann joined the room.');
    const field = document.querySelector<HTMLTextAreaElement>('.editor-chat-edit-field');
    if (field === null) throw new Error('no edit field');
    field.value = 'hello';
    press(field, 'Enter');
    test.replies.at(-1)?.(edited(3, 1, 'hello'));
    await settle();
    expect(document.activeElement).toBe(test.chat.panel.composer.field);
    expect(document.querySelector('[data-chat-id="3"] .editor-chat-text')?.textContent).toBe('hello (edited)');
    expect(document.querySelector('.editor-chat-row-presence')?.textContent).toContain('Ann joined the room.');
    test.chat.dispose();
  });

  it('keeps the favicon badge in sync with the status bar unread count', () => {
    const { chat, statusBar, favicon } = fixture();
    chat.roomEntered('Lobby');
    for (let id = 1; id <= 100; id++) chat.received(message(id, 2, `m${id}`));
    expect(chat.unreadCount()).toBe(100);
    expect(statusBar.querySelector('.editor-chat-badge')?.textContent).toBe('99+');
    expect(favicon.unreadSet).toHaveBeenLastCalledWith(100);
    chat.dispose();
    expect(favicon.dispose).toHaveBeenCalled();
  });

  it('counts a message as unread when the window is open but the user is idle', () => {
    const target = new EventTarget();
    const idle = new UserIdle({ target, hidden: () => true, idleMs: 30_000, now: () => 0 });
    const { chat, statusBar, favicon } = fixture({ idle });
    chat.roomEntered('Lobby');
    chat.open();
    expect(chat.unreadCount()).toBe(0);
    chat.received(message(1, 2, 'away'));
    expect(chat.unreadCount()).toBe(1);
    expect(statusBar.querySelector('.editor-chat-badge')?.textContent).toBe('1');
    expect(favicon.unreadSet).toHaveBeenLastCalledWith(1);
    expect(chat.toast.isShown()).toBe(false);
    chat.dispose();
    idle.dispose();
  });

  it('clears unread on activity only when the chat window is open', () => {
    const target = new EventTarget();
    let hidden = true;
    const idle = new UserIdle({ target, hidden: () => hidden, idleMs: 30_000, now: () => 0 });
    const { chat, statusBar, favicon } = fixture({ idle });
    chat.roomEntered('Lobby');
    chat.received(message(1, 2, 'closed'));
    hidden = false;
    target.dispatchEvent(new Event('pointermove'));
    expect(chat.unreadCount()).toBe(1);
    expect(statusBar.querySelector('.editor-chat-badge')?.textContent).toBe('1');
    expect(favicon.unreadSet).toHaveBeenLastCalledWith(1);
    chat.open();
    expect(chat.unreadCount()).toBe(0);
    chat.panel.hide(true);
    hidden = true;
    chat.received(message(2, 2, 'later'));
    expect(chat.unreadCount()).toBe(1);
    chat.open();
    expect(chat.unreadCount()).toBe(0);
    hidden = true;
    chat.received(message(3, 2, 'while open and idle'));
    expect(chat.unreadCount()).toBe(1);
    hidden = false;
    target.dispatchEvent(new Event('pointermove'));
    expect(chat.unreadCount()).toBe(0);
    expect(statusBar.querySelector<HTMLElement>('.editor-chat-badge')?.style.display).toBe('none');
    expect(favicon.unreadSet).toHaveBeenLastCalledWith(0);
    chat.dispose();
    idle.dispose();
  });

  it('clears the favicon badge when the last unread message expires', () => {
    vi.useFakeTimers();
    const { chat, favicon, clock } = fixture();
    chat.roomEntered('Lobby');
    chat.received(messageAt(1, 2, 'hi', clock.now));
    expect(favicon.unreadSet).toHaveBeenLastCalledWith(1);
    clock.now += LOG_COLLABORATION_CHAT_AGE_MAXIMUM_MS + 1;
    vi.advanceTimersByTime(CONTROLLER_COLLABORATION_CHAT_EXPIRE_EVERY_MS);
    expect(chat.unreadCount()).toBe(0);
    expect(favicon.unreadSet).toHaveBeenLastCalledWith(0);
    chat.dispose();
  });

  it('plays the chat sound only when someone else increments the unread count', () => {
    const target = new EventTarget();
    let hidden = false;
    const idle = new UserIdle({ target, hidden: () => hidden, idleMs: 30_000, now: () => 0 });
    const { chat, sound, favicon } = fixture({ idle });
    chat.roomEntered('Lobby');
    expect(sound.play).not.toHaveBeenCalled();
    chat.received(message(1, 2, 'hi'));
    expect(chat.unreadCount()).toBe(1);
    expect(sound.play).toHaveBeenCalledTimes(1);
    expect(favicon.unreadSet).toHaveBeenLastCalledWith(1);
    chat.received(message(2, 1, 'own'));
    expect(chat.unreadCount()).toBe(1);
    expect(sound.play).toHaveBeenCalledTimes(1);
    chat.open();
    expect(chat.unreadCount()).toBe(0);
    chat.received(message(3, 2, 'looking'));
    expect(chat.unreadCount()).toBe(0);
    expect(sound.play).toHaveBeenCalledTimes(1);
    hidden = true;
    chat.received(message(4, 2, 'away'));
    expect(chat.unreadCount()).toBe(1);
    expect(sound.play).toHaveBeenCalledTimes(2);
    chat.presenceReceived(5, 'Ann', 3, true);
    expect(sound.play).toHaveBeenCalledTimes(2);
    chat.dispose();
    expect(sound.dispose).toHaveBeenCalled();
    idle.dispose();
  });

  it('warms the sound on activity and does not play when activity leaves a closed chat unread', () => {
    const { chat, sound, idleTarget } = fixture();
    chat.roomEntered('Lobby');
    chat.received(message(1, 2, 'hi'));
    expect(sound.play).toHaveBeenCalledTimes(1);
    idleTarget.dispatchEvent(new Event('pointermove'));
    expect(sound.warm).toHaveBeenCalled();
    expect(chat.unreadCount()).toBe(1);
    expect(sound.play).toHaveBeenCalledTimes(1);
    chat.dispose();
  });
});
