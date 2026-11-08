import { describe, expect, it, vi } from 'vitest';
import { CustomCollaborationChannel } from '@/collaboration/forks/custom_collaboration_channel.js';
import { customFrameEncode, customFrameParse } from '@/collaboration/shared/custom_frame.js';
import type { SocketCollaborationClient } from '@/collaboration/net/socket_collaboration_client.js';
import { runtimeCollaborationErrorMessage } from '@/collaboration/runtime/runtime_collaboration_errors.js';

/**
 * Creates an API with observable transport and runtime flags.
 *
 * @param owner Whether the API belongs to the owner.
 * @param synced Whether the runtime is synced.
 * @returns API and transport calls.
 */
function fixture(owner = false, synced = true) {
  const frames: Uint8Array[] = [];
  const request = vi.fn().mockResolvedValue({ t: 'ok' });
  const requestBinary = vi.fn((encode: (r: number) => Uint8Array) => {
    frames.push(encode(42));
    return Promise.resolve({ t: 'custom.sent', r: 42 });
  });
  const client = { request, requestBinary } as unknown as SocketCollaborationClient;
  return {
    api: new CustomCollaborationChannel(
      () => client,
      () => synced,
      () => owner,
    ),
    request,
    requestBinary,
    frames,
  };
}

describe('third-party custom channel', () => {
  it('preserves opaque bytes and optional scene guards addressing the owner', async () => {
    const { api, frames } = fixture();
    const bytes = new Uint8Array([0, 255, 128, 12]);
    await api.sendToOwner(bytes, { lease: 9, ids: ['terrain'] });
    const parsed = customFrameParse(frames[0] ?? new Uint8Array());
    expect(parsed).toMatchObject({ r: 42, peer: 0, guard: { lease: 9, ids: ['terrain'] } });
    expect(parsed?.payload).toEqual(bytes);
  });

  it('only the owner can target a specific member', async () => {
    const { api, frames } = fixture(true);
    await api.sendToMember(7, new Uint8Array([1]));
    expect(customFrameParse(frames[0] ?? new Uint8Array())?.peer).toBe(7);
    await expect(api.sendToOwner(new Uint8Array())).rejects.toThrow('Only members');
    await expect(fixture().api.sendToMember(8, new Uint8Array())).rejects.toThrow('Only the owner');
  });

  it('rejects unsynced sends and oversize data without touching transport', async () => {
    const { api, requestBinary } = fixture(false, false);
    await expect(api.sendToOwner(new Uint8Array())).rejects.toThrow('Not synced');
    expect(requestBinary).not.toHaveBeenCalled();
    await expect(fixture().api.sendToOwner(new Uint8Array(256 * 1024 + 1))).rejects.toThrow('256 KiB');
  });

  it('routes and unsubscribes opaque bytes without passing them into scene decoders', () => {
    const { api } = fixture();
    const listener = vi.fn();
    const unsubscribe = api.onMessage(listener);
    const bytes = new Uint8Array([128, 0]);
    const frame = customFrameEncode(3, 7, bytes);
    expect(api.receive(frame)).toBe(true);
    expect(listener).toHaveBeenCalledWith(7, bytes);
    unsubscribe();
    api.receive(frame);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(api.receive(new Uint8Array([0xa7, 1]))).toBe(false);
    expect(fixture(false, false).api.receive(frame)).toBe(true);
  });

  it('uses custom lock messages, not scene lock or lease ids', async () => {
    const { api, request } = fixture();
    await api.acquire(['third-party terrain']);
    await api.release(['third-party terrain']);
    await api.release();
    expect(request.mock.calls.map((call) => call[0])).toEqual([
      { t: 'custom.lock.acquire', keys: ['third-party terrain'] },
      { t: 'custom.lock.release', keys: ['third-party terrain'] },
      { t: 'custom.lock.release' },
    ]);
  });

  it('shows an incompatible-client message without exposing any identity', () => {
    const text = runtimeCollaborationErrorMessage('client_incompatible');
    expect(text).toContain('incompatible');
    expect(text).toContain('fork');
    expect(text).not.toContain('https://');
  });
});

/** Broadcast is exclusively owner-authorized and still requires sync. */
it('exposes an explicit owner broadcast API, never a member broadcast path', async () => {
  const { api, frames } = fixture(true);
  await api.sendToAll(new Uint8Array([0, 255]), { lease: 8, ids: ['terrain'] });
  expect(customFrameParse(frames[0]!)).toMatchObject({
    peer: 0,
    guard: { broadcast: true, lease: 8, ids: ['terrain'] },
  });
  await expect(fixture().api.sendToAll(new Uint8Array())).rejects.toThrow('Only the owner');
  await expect(fixture(true, false).api.sendToAll(new Uint8Array())).rejects.toThrow('Not synced');
});
