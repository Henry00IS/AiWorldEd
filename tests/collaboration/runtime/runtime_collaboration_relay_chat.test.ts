import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { SocketCollaborationError } from '@/collaboration/net/socket_collaboration_types.js';
import {
  harnessCollaborationRelayUp,
  harnessCollaborationUntil,
  type HarnessCollaborationEditor,
} from './harness_collaboration_editor.js';
import {
  HARNESS_RELAY_REQUIRED,
  harnessRelayClose,
  harnessRelayJoin,
  harnessRelayRoom,
} from './harness_collaboration_relay.js';

let relayUp = false;

beforeAll(async () => {
  relayUp = await harnessCollaborationRelayUp();
  if (!relayUp && HARNESS_RELAY_REQUIRED) throw new Error('collaboration relay is not reachable');
});

afterEach(harnessRelayClose);

/**
 * Returns the names of a client's room members.
 *
 * @param client Client.
 * @returns Member names.
 */
function names(client: HarnessCollaborationEditor): string[] {
  return (client.runtime.session?.roster.list() ?? []).map((member) => member.name);
}

/**
 * Sends a chat message and returns the relay error code, or 'ok'.
 *
 * @param client Sender.
 * @param text Text.
 * @returns Error code or 'ok'.
 */
async function sendCode(client: HarnessCollaborationEditor, text: string): Promise<string> {
  try {
    await client.runtime.chatSend(text);
    return 'ok';
  } catch (error) {
    return error instanceof SocketCollaborationError ? error.code : String(error);
  }
}

/** Integration tests against the real relay for room chat and room-unique names. */
describe('collaboration relay chat', { timeout: 20000 }, () => {
  it('reports the chat limits in the welcome', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner } = await harnessRelayRoom('ChatLimits');
    const limits = owner.runtime.limits();
    expect(limits.chatIntervalMs).toBeGreaterThan(0);
    expect(limits.chatTextLength).toBe(2000);
    expect(limits.chatTextLines).toBeGreaterThan(0);
  });

  it('numbers members who join with a taken name', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoom('ChatNames');
    await harnessRelayJoin(room, 'Henry');
    const second = await harnessRelayJoin(room, 'henry');
    const long = await harnessRelayJoin(room, 'HenryHenryHe');
    await harnessRelayJoin(room, 'HenryHenryHe');
    await harnessCollaborationUntil(() => names(owner).length === 5, 5000, 'roster');
    expect(names(owner)).toEqual(expect.arrayContaining(['Henry', 'henry2', 'HenryHenryHe', 'HenryHenryH2']));
    await harnessCollaborationUntil(() => names(second).length === 5, 5000, 'joiner roster');
    expect(names(long)).toContain('henry2');
    const reply = await second.runtime.chatSend('who am I');
    expect(reply['name']).toBe('henry2');
  });

  it('delivers a message to the other members with the cleaned text and the sender', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoom('ChatSend');
    const joiner = await harnessRelayJoin(room, 'Ann');
    const reply = await joiner.runtime.chatSend('hi\u202E <b>there</b>\u200B');
    expect(reply['t']).toBe('chat.sent');
    expect(reply['name']).toBe('Ann');
    await harnessCollaborationUntil(() => owner.chats.length === 1, 5000, 'chat delivered');
    const received = owner.chats[0];
    expect(received?.['text']).toBe('hi <b>there</b>');
    expect(received?.['from']).toBe(joiner.runtime.user());
    expect(received?.['id']).toBe(reply['id']);
    expect(joiner.chats).toHaveLength(0);
  });

  it('refuses a second message within the interval with a retry time', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner } = await harnessRelayRoom('ChatRate');
    expect(await sendCode(owner, 'one')).toBe('ok');
    try {
      await owner.runtime.chatSend('two');
      throw new Error('not rate limited');
    } catch (error) {
      expect(error).toBeInstanceOf(SocketCollaborationError);
      const limited = error as SocketCollaborationError;
      expect(limited.code).toBe('chat_rate_limited');
      expect(limited.details['retryAfterMs']).toBeGreaterThan(0);
    }
  });

  it('refuses empty and oversized messages', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner } = await harnessRelayRoom('ChatInvalid');
    expect(await sendCode(owner, '\u200B\u202E ')).toBe('invalid_chat');
    expect(await sendCode(owner, 'x'.repeat(2001))).toBe('invalid_chat');
    expect(await sendCode(owner, 'a\n'.repeat(30))).toBe('invalid_chat');
  });

  it('keeps chat inside its room', async ({ skip }) => {
    if (!relayUp) skip();
    const first = await harnessRelayRoom('ChatIsolationA');
    const second = await harnessRelayRoom('ChatIsolationB');
    const listener = await harnessRelayJoin(second.room, 'Listener');
    expect(await sendCode(first.owner, 'only room A')).toBe('ok');
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(listener.chats).toHaveLength(0);
    expect(second.owner.chats).toHaveLength(0);
  });
});
