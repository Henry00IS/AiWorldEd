import { describe, expect, it } from 'vitest';
import {
  LEASE_COLLABORATION_RENEW_MS,
  LEASE_COLLABORATION_RETRY_MS,
  LeaseCollaborationClient,
} from '@/collaboration/sync/lease_collaboration_client.js';

/** Message a fake relay answers with. */
type Reply = Record<string, unknown>;

/**
 * Builds a client over a fake relay.
 *
 * @param answer Reply of each acquire.
 * @returns Client and the messages it sent.
 */
function clientCreate(answer: (message: Reply) => Reply): { client: LeaseCollaborationClient; sent: Reply[] } {
  const sent: Reply[] = [];
  const client = new LeaseCollaborationClient({
    request: (message) => {
      sent.push(message as Reply);
      return Promise.resolve({ t: 'lock.result', ...answer(message as Reply) });
    },
    send: (message) => sent.push(message as Reply),
  });
  return { client, sent };
}

/** One lease per operation: monotonic numbers, replace, renew, release. */
describe('lease_collaboration_client', () => {
  it('asks for one replacing lease with a new monotonic number per operation', async () => {
    const { client, sent } = clientCreate(() => ({ ok: true, add: ['a'] }));
    const first = await client.acquire(['a'], ['root'], 256, 0);
    const second = await client.acquire(['b'], [], 256, 10);
    expect(first.ok && second.ok).toBe(true);
    expect(sent[0]).toMatchObject({ t: 'lock.acquire', ids: ['a'], shared: ['root'], replace: true });
    expect(Number(sent[1]?.['lease'])).toBeGreaterThan(Number(sent[0]?.['lease']));
    expect(client.covers(['b'])).toBe(true);
    expect(client.covers(['a'])).toBe(false);
  });

  it('chunks a large request into messages that extend the same lease', async () => {
    const { client, sent } = clientCreate(() => ({ ok: true }));
    const ids = Array.from({ length: 600 }, (_, index) => `n${index}`);
    await client.acquire(ids, [], 256, 0);
    expect(sent).toHaveLength(3);
    expect(new Set(sent.map((message) => message['lease'])).size).toBe(1);
    expect(sent.filter((message) => message['replace'] === true)).toHaveLength(1);
    expect(client.covers(ids)).toBe(true);
  });

  it('is pending (asks) until granted and forgets a refusal with a short backoff', async () => {
    let resolve: (reply: Reply) => void = () => undefined;
    const client = new LeaseCollaborationClient({
      request: () => new Promise((done) => (resolve = (reply) => done({ t: 'lock.result', ...reply }))),
      send: () => undefined,
    });
    const outcome = client.acquire(['a'], [], 256, 100);
    expect(client.state()).toBe('pending');
    expect(client.asks(['a'])).toBe(true);
    expect(client.covers(['a'])).toBe(false);
    resolve({ ok: false, code: 'lease_busy', conflicts: [{ id: 'a', by: 2 }] });
    expect(await outcome).toMatchObject({ ok: false, code: 'lease_busy' });
    expect(client.state()).toBe('none');
    expect(client.retryAllowed(100 + LEASE_COLLABORATION_RETRY_MS - 1)).toBe(false);
    client.retryNow();
    expect(client.retryAllowed(101)).toBe(true);
  });

  it('renews only a granted lease and only when due, and releases once', async () => {
    const { client, sent } = clientCreate(() => ({ ok: true }));
    expect(client.renew(1e6)).toBe(false);
    await client.acquire(['a'], [], 256, 0);
    expect(client.renew(LEASE_COLLABORATION_RENEW_MS - 1)).toBe(false);
    client.progressed(500);
    expect(client.renew(LEASE_COLLABORATION_RENEW_MS)).toBe(false);
    expect(client.renew(500 + LEASE_COLLABORATION_RENEW_MS)).toBe(true);
    expect(sent.at(-1)).toMatchObject({ t: 'lock.renew' });
    expect(client.release()).toBe(true);
    expect(client.release()).toBe(false);
    expect(sent.filter((message) => message['t'] === 'lock.release')).toHaveLength(1);
  });

  it('adopts created ids, forgets deleted ones and forgets everything on expiry', async () => {
    const { client } = clientCreate(() => ({ ok: true }));
    await client.acquire(['a'], [], 256, 0);
    client.adopt(['new']);
    expect(client.covers(['a', 'new'])).toBe(true);
    client.forget(['a']);
    expect(client.covers(['a'])).toBe(false);
    client.expired();
    expect(client.state()).toBe('none');
    expect(client.covers(['new'])).toBe(false);
  });

  it('treats a lost request as a refusal (timeout)', async () => {
    const client = new LeaseCollaborationClient({
      request: () => Promise.reject(new Error('closed')),
      send: () => undefined,
    });
    expect(await client.acquire(['a'], [], 256, 0)).toMatchObject({ ok: false, code: 'timeout' });
  });
});
