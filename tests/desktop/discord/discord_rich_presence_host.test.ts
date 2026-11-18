import { describe, expect, it } from 'vitest';
import { DISCORD_IPC_OPCODE_FRAME, DISCORD_IPC_OPCODE_HANDSHAKE } from '@/desktop/discord/discord_ipc_opcode.js';
import { DiscordRichPresenceHost } from '@/desktop/discord/discord_rich_presence_host.js';
import { DISCORD_RICH_PRESENCE_THROTTLE_MS } from '@/desktop/discord/discord_rich_presence_constants.js';
import type { DiscordRichPresenceEditorState } from '@/desktop/discord/discord_rich_presence_activity.js';
import {
  discordIpcFakeConnect,
  discordIpcFakeFlushMicrotasks,
  discordIpcFakeWaitForWrite,
  DiscordIpcFakeSocket,
} from './discord_ipc_fake_socket.js';
import { DiscordRichPresenceClockFake } from './discord_rich_presence_clock_fake.js';

const PATH = '/tmp/discord-ipc-0';

/**
 * Returns a basic enabled editor state.
 *
 * @param overrides Partial state fields.
 * @returns Complete editor state.
 */
function editorState(overrides: Partial<DiscordRichPresenceEditorState> = {}): DiscordRichPresenceEditorState {
  return {
    enabled: true,
    hideProjectName: false,
    projectName: 'Castle',
    levelName: 'keep.aiworld',
    brushCount: 3,
    ...overrides,
  };
}

/**
 * Creates a host bound to a fake socket and clock.
 *
 * @param socket Fake Discord socket.
 * @param clock Fake clock.
 * @returns Host.
 */
function createHost(socket: DiscordIpcFakeSocket, clock: DiscordRichPresenceClockFake): DiscordRichPresenceHost {
  return new DiscordRichPresenceHost({
    pid: 99,
    connect: discordIpcFakeConnect(new Map([[PATH, socket]])),
    paths: () => [PATH],
    clock,
  });
}

/**
 * Flushes pending microtasks and completes a handshake on the fake socket.
 *
 * @param socket Fake Discord socket.
 */
async function completeHandshake(socket: DiscordIpcFakeSocket): Promise<void> {
  await discordIpcFakeWaitForWrite(socket, socket.writes.length + 1);
  socket.receivePayload(DISCORD_IPC_OPCODE_FRAME, { evt: 'READY' });
  await discordIpcFakeFlushMicrotasks();
}

/**
 * Waits until a connection-attempt list reaches the expected length.
 *
 * @param connections Connection-attempt log.
 * @param length Expected number of attempts.
 * @returns Resolves when the length is reached.
 */
async function waitForConnectionAttempts(connections: string[], length: number): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (connections.length >= length) return;
    await Promise.resolve();
  }
  throw new Error(`expected ${length} connection attempts, got ${connections.length}`);
}

/**
 * Returns SET_ACTIVITY frames written to a fake socket.
 *
 * @param socket Fake Discord socket.
 * @returns SET_ACTIVITY payloads.
 */
function activityFrames(socket: DiscordIpcFakeSocket): unknown[] {
  return socket
    .writtenFrames()
    .filter((frame) => frame.opcode === DISCORD_IPC_OPCODE_FRAME)
    .map((frame) => frame.payload);
}

describe('discord_rich_presence_host', () => {
  it('connects, handshakes, and sends activity built from editor state', async () => {
    const socket = new DiscordIpcFakeSocket();
    const clock = new DiscordRichPresenceClockFake(5_000);
    const host = createHost(socket, clock);
    host.update(editorState());
    await completeHandshake(socket);
    expect(socket.writtenFrames()[0]?.opcode).toBe(DISCORD_IPC_OPCODE_HANDSHAKE);
    expect(activityFrames(socket)[0]).toMatchObject({
      cmd: 'SET_ACTIVITY',
      args: {
        pid: 99,
        activity: {
          details: 'keep',
          state: 'Editing 3 Brushes',
          timestamps: { start: 5_000 },
          assets: { large_image: 'logo' },
        },
      },
    });
  });

  it('throttles activity updates to one every 15 seconds and sends the latest state', async () => {
    const socket = new DiscordIpcFakeSocket();
    const clock = new DiscordRichPresenceClockFake(5_000);
    const host = createHost(socket, clock);
    host.update(editorState({ brushCount: 1 }));
    await completeHandshake(socket);
    host.update(editorState({ brushCount: 2 }));
    host.update(editorState({ brushCount: 8 }));
    expect(activityFrames(socket)).toHaveLength(1);
    expect(activityFrames(socket)[0]).toMatchObject({ args: { activity: { state: 'Editing 1 Brush' } } });
    clock.advance(DISCORD_RICH_PRESENCE_THROTTLE_MS);
    expect(activityFrames(socket)).toHaveLength(2);
    expect(activityFrames(socket)[1]).toMatchObject({ args: { activity: { state: 'Editing 8 Brushes' } } });
  });

  it('retries with backoff when Discord is not running, then sends activity when it appears', async () => {
    const socket = new DiscordIpcFakeSocket();
    const clock = new DiscordRichPresenceClockFake(5_000);
    const connections: string[] = [];
    const host = new DiscordRichPresenceHost({
      pid: 99,
      paths: () => [PATH],
      clock,
      connect: async (path, handlers) => {
        connections.push(path);
        if (connections.length === 1) throw new Error('not running');
        socket.bind(handlers);
        return socket;
      },
    });
    host.update(editorState());
    await waitForConnectionAttempts(connections, 1);
    await discordIpcFakeFlushMicrotasks();
    expect(host.isReady()).toBe(false);
    expect(connections).toHaveLength(1);
    clock.advance(1_000);
    await waitForConnectionAttempts(connections, 2);
    await completeHandshake(socket);
    expect(host.isReady()).toBe(true);
    expect(activityFrames(socket)[0]).toMatchObject({ cmd: 'SET_ACTIVITY' });
  });

  it('reconnects after Discord closes the socket', async () => {
    const first = new DiscordIpcFakeSocket();
    const second = new DiscordIpcFakeSocket();
    const clock = new DiscordRichPresenceClockFake(5_000);
    const sockets = [first, second];
    const host = new DiscordRichPresenceHost({
      pid: 99,
      paths: () => [PATH],
      clock,
      connect: async (_path, handlers) => {
        const socket = sockets.shift();
        if (socket === undefined) throw new Error('no socket');
        socket.bind(handlers);
        return socket;
      },
    });
    host.update(editorState());
    await completeHandshake(first);
    first.close();
    await discordIpcFakeFlushMicrotasks();
    clock.advance(1_000);
    await completeHandshake(second);
    expect(activityFrames(second)[0]).toMatchObject({ cmd: 'SET_ACTIVITY' });
  });

  it('clears activity and stops reconnecting when presence is turned off or the host quits', async () => {
    const socket = new DiscordIpcFakeSocket();
    const clock = new DiscordRichPresenceClockFake(5_000);
    const host = createHost(socket, clock);
    host.update(editorState());
    await completeHandshake(socket);
    host.update(editorState({ enabled: false }));
    const cleared = activityFrames(socket).at(-1);
    expect(cleared).toMatchObject({ cmd: 'SET_ACTIVITY', args: { activity: null } });
    expect(socket.closed).toBe(true);
    host.update(editorState({ enabled: true }));
    await completeHandshake(socket);
    host.quit();
    expect(activityFrames(socket).at(-1)).toMatchObject({ args: { activity: null } });
    const writes = socket.writes.length;
    clock.advance(60_000);
    expect(socket.writes.length).toBe(writes);
  });
});
