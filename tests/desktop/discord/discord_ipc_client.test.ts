import { describe, expect, it } from 'vitest';
import { DISCORD_APPLICATION_ID } from '@/desktop/discord/discord_application_id.js';
import { DiscordIpcClient } from '@/desktop/discord/discord_ipc_client.js';
import {
  DISCORD_IPC_OPCODE_CLOSE,
  DISCORD_IPC_OPCODE_FRAME,
  DISCORD_IPC_OPCODE_HANDSHAKE,
  DISCORD_IPC_OPCODE_PING,
  DISCORD_IPC_OPCODE_PONG,
} from '@/desktop/discord/discord_ipc_opcode.js';
import {
  discordIpcFakeConnect,
  discordIpcFakeFlushMicrotasks,
  discordIpcFakeWaitForWrite,
  DiscordIpcFakeSocket,
} from './discord_ipc_fake_socket.js';
import { DiscordRichPresenceClockFake } from './discord_rich_presence_clock_fake.js';

/**
 * Connects a client to a fake socket and completes the handshake.
 *
 * @param socket Fake Discord socket.
 * @param path Socket path to accept.
 * @returns Connected client, clock, and socket.
 */
async function handshakeClient(
  socket: DiscordIpcFakeSocket = new DiscordIpcFakeSocket(),
  path = '/tmp/discord-ipc-0',
): Promise<{ client: DiscordIpcClient; clock: DiscordRichPresenceClockFake; socket: DiscordIpcFakeSocket }> {
  const clock = new DiscordRichPresenceClockFake();
  const client = new DiscordIpcClient({
    connect: discordIpcFakeConnect(new Map([[path, socket]])),
    clock,
  });
  const connecting = client.connect([path]);
  await discordIpcFakeWaitForWrite(socket);
  socket.receivePayload(DISCORD_IPC_OPCODE_FRAME, { cmd: 'DISPATCH', evt: 'READY' });
  expect(await connecting).toBe(true);
  return { client, clock, socket };
}

describe('discord_ipc_client', () => {
  it('sends a v1 handshake and SET_ACTIVITY after READY', async () => {
    const { client, socket } = await handshakeClient();
    expect(socket.writtenFrames()[0]).toEqual({
      opcode: DISCORD_IPC_OPCODE_HANDSHAKE,
      payload: { v: 1, client_id: DISCORD_APPLICATION_ID },
    });
    expect(client.isReady()).toBe(true);
    client.setActivity(
      {
        details: 'Keep',
        state: 'Editing 2 Brushes',
        timestamps: { start: 10 },
        assets: { large_image: 'logo', large_text: 'AI World Editor' },
      },
      4242,
    );
    const activity = socket.writtenFrames().at(-1);
    expect(activity?.opcode).toBe(DISCORD_IPC_OPCODE_FRAME);
    expect(activity?.payload).toMatchObject({
      cmd: 'SET_ACTIVITY',
      args: { pid: 4242, activity: { details: 'Keep', state: 'Editing 2 Brushes' } },
    });
  });

  it('replies to PING with PONG using the same payload', async () => {
    const { socket } = await handshakeClient();
    socket.receivePayload(DISCORD_IPC_OPCODE_PING, { nonce: 'ping-1' });
    expect(socket.writtenFrames().at(-1)).toEqual({
      opcode: DISCORD_IPC_OPCODE_PONG,
      payload: { nonce: 'ping-1' },
    });
  });

  it('is no longer ready after a CLOSE frame', async () => {
    const { client, socket } = await handshakeClient();
    socket.receivePayload(DISCORD_IPC_OPCODE_CLOSE, { code: 4000 });
    expect(client.isReady()).toBe(false);
  });

  it('skips missing sockets and connects to the first path that answers', async () => {
    const socket = new DiscordIpcFakeSocket();
    const clock = new DiscordRichPresenceClockFake();
    const client = new DiscordIpcClient({
      connect: discordIpcFakeConnect(new Map([['/tmp/discord-ipc-2', socket]])),
      clock,
    });
    const connecting = client.connect(['/tmp/discord-ipc-0', '/tmp/discord-ipc-2']);
    await discordIpcFakeWaitForWrite(socket);
    socket.receivePayload(DISCORD_IPC_OPCODE_FRAME, { evt: 'READY' });
    expect(await connecting).toBe(true);
    expect(client.isReady()).toBe(true);
  });

  it('fails the handshake when READY does not arrive before the timeout', async () => {
    const socket = new DiscordIpcFakeSocket();
    const clock = new DiscordRichPresenceClockFake();
    const client = new DiscordIpcClient({
      connect: discordIpcFakeConnect(new Map([['/tmp/discord-ipc-0', socket]])),
      clock,
      handshakeTimeoutMs: 5_000,
    });
    const connecting = client.connect(['/tmp/discord-ipc-0']);
    await discordIpcFakeWaitForWrite(socket);
    clock.advance(5_000);
    await discordIpcFakeFlushMicrotasks();
    expect(await connecting).toBe(false);
    expect(client.isReady()).toBe(false);
  });
});
