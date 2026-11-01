import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { SocketCollaborationMessage } from '@/collaboration/net/socket_collaboration_types.js';
import type { NodeCollaborationState } from '@/collaboration/scene/node_collaboration_types.js';
import {
  harnessCollaborationRelayUp,
  harnessCollaborationUntil,
  type HarnessCollaborationEditor,
} from './harness_collaboration_editor.js';
import {
  HARNESS_RELAY_REQUIRED,
  harnessRelayClose,
  harnessRelayConverged,
  harnessRelayJoin,
  harnessRelayRoomBuilt,
} from './harness_collaboration_relay.js';

let relayUp = false;

beforeAll(async () => {
  relayUp = await harnessCollaborationRelayUp();
  if (!relayUp && HARNESS_RELAY_REQUIRED) throw new Error('collaboration relay is not reachable');
});

afterEach(harnessRelayClose);

/** Raw socket client of a runtime. */
interface OwnerVerifySocket {
  send(message: object): void;
  request(message: object, timeoutMs?: number): Promise<SocketCollaborationMessage>;
}

/**
 * Builds Group A holding Cube, Group B holding Inner, and a loose Crate.
 *
 * @param owner Owner client.
 */
function sceneBuild(owner: HarnessCollaborationEditor): void {
  owner.boxAdd('Cube', owner.groupAdd('Group A'));
  owner.boxAdd('Inner', owner.groupAdd('Group B'));
  owner.boxAdd('Crate').position.set(4, 0, 0);
}

/**
 * Creates the room and joins Mallory and Bob.
 *
 * @param name Room name.
 * @returns Owner, Mallory and Bob.
 */
async function roomOfThree(name: string): Promise<HarnessCollaborationEditor[]> {
  const { owner, room } = await harnessRelayRoomBuilt(name, sceneBuild);
  const mallory = await harnessRelayJoin(room, 'Mallory');
  const bob = await harnessRelayJoin(room, 'Bob');
  return [owner, mallory, bob];
}

/**
 * Returns the raw socket client of a member, bypassing the editor.
 *
 * @param client Member.
 * @returns Socket client.
 */
function socketOf(client: HarnessCollaborationEditor): OwnerVerifySocket {
  return (client.runtime as unknown as { client: OwnerVerifySocket }).client;
}

/**
 * Returns the wire id of a named object.
 *
 * @param client Member.
 * @param name Object name.
 * @returns Node id.
 */
function idOf(client: HarnessCollaborationEditor, name: string): string {
  return client.nodeIdOf(client.object(name));
}

/**
 * Returns the agreed parent of a named object.
 *
 * @param client Member.
 * @param name Object name.
 * @returns Parent node id; empty for the world.
 */
function parentOf(client: HarnessCollaborationEditor, name: string): string | undefined {
  return client.runtime.session?.sync.replica.baselines.get(idOf(client, name))?.state.parent;
}

/**
 * Copies the agreed state of a named object under another parent.
 *
 * @param client Member.
 * @param name Object name.
 * @param parent New parent id.
 * @returns State.
 */
function stateMoved(client: HarnessCollaborationEditor, name: string, parent: string): NodeCollaborationState {
  const state = client.runtime.session?.sync.replica.baselines.get(idOf(client, name))?.state;
  if (state === undefined) throw new Error(`${name} has no baseline`);
  return { ...(JSON.parse(JSON.stringify(state)) as NodeCollaborationState), parent };
}

/**
 * Records the room messages a member receives.
 *
 * @param client Member.
 * @returns Received messages, appended as they arrive.
 */
function messagesTap(client: HarnessCollaborationEditor): SocketCollaborationMessage[] {
  const session = client.runtime.session;
  if (session === null) throw new Error('no session');
  const seen: SocketCollaborationMessage[] = [];
  const original = session.message.bind(session);
  session.message = (message) => {
    seen.push(message);
    original(message);
  };
  return seen;
}

/**
 * Stops the owner from answering verify queries, like a stalled owner.
 *
 * @param owner Owner.
 */
function ownerMute(owner: HarnessCollaborationEditor): void {
  const sync = owner.runtime.session?.sync;
  if (sync === undefined) throw new Error('no session');
  sync.verify = () => undefined;
}

/** Members lying about the hierarchy; the room owner answers each claim. */
describe('collaboration relay owner verification', { timeout: 30000 }, () => {
  it('grants honest nested selections and keeps them cached', async ({ skip }) => {
    if (!relayUp) skip();
    const [owner, mallory, bob] = await roomOfThree('Verify honest');
    await bob.select('Cube');
    expect(
      await socketOf(mallory).request({ t: 'lock.acquire', ids: [idOf(mallory, 'Group A')], replace: true }),
    ).toMatchObject({ ok: false, code: 'lock_conflict' });
    await bob.select('Cube', 'Crate');
    await bob.deselect();
    await harnessRelayConverged([owner!, mallory!, bob!]);
  });

  it('refuses claimed ancestors the selection does not have', async ({ skip }) => {
    if (!relayUp) skip();
    const [owner, mallory, bob] = await roomOfThree('Verify wrong ancestors');
    const reply = await socketOf(mallory).request({
      t: 'lock.acquire',
      ids: [idOf(mallory, 'Crate')],
      replace: true,
      shared: [idOf(mallory, 'Group B')],
    });
    expect(reply).toMatchObject({ ok: false, code: 'lock_unverified', why: 'invalid' });
    await bob.select('Group B');
    await harnessRelayConverged([owner!, mallory!, bob!]);
  });

  it('reports unknown ids as deleted', async ({ skip }) => {
    if (!relayUp) skip();
    const [, mallory] = await roomOfThree('Verify deleted');
    const reply = await socketOf(mallory).request({
      t: 'lock.acquire',
      ids: [idOf(mallory, 'Crate')],
      replace: true,
      shared: [crypto.randomUUID()],
    });
    expect(reply).toMatchObject({ ok: false, code: 'lock_unverified', why: 'deleted' });
  });

  it('keeps containers safe when a member claims no ancestors', async ({ skip }) => {
    if (!relayUp) skip();
    const [owner, mallory, bob] = await roomOfThree('Verify no ancestors');
    const reply = await socketOf(mallory).request({ t: 'lock.acquire', ids: [idOf(mallory, 'Cube')], replace: true });
    expect(reply['ok']).toBe(true);
    const subtree = [idOf(bob, 'Group A'), idOf(bob, 'Cube')];
    expect(await socketOf(bob).request({ t: 'lock.acquire', ids: subtree, replace: true })).toMatchObject({
      ok: false,
      code: 'lock_conflict',
    });
    await harnessRelayConverged([owner!, mallory!, bob!]);
  });

  it('ignores moves whose parent chain names another container', async ({ skip }) => {
    if (!relayUp) skip();
    const [owner, mallory, bob] = await roomOfThree('Verify lying chain');
    await mallory.select('Crate');
    const crate = idOf(mallory, 'Crate');
    const groupA = idOf(mallory, 'Group A');
    const groupB = idOf(mallory, 'Group B');
    const socket = socketOf(mallory);
    socket.send({
      t: 'edit',
      seq: 900001,
      ops: [{ k: 'reparent', ids: [crate], p: [groupA], d: { s: stateMoved(mallory, 'Crate', groupB) } }],
    });
    socket.send({
      t: 'edit',
      seq: 900002,
      ops: [{ k: 'property', ids: [crate], d: { s: stateMoved(mallory, 'Crate', groupB) } }],
    });
    owner.object('Crate');
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(parentOf(owner!, 'Crate')).toBe('');
    expect(parentOf(bob!, 'Crate')).toBe('');
    expect(owner!.object('Crate').parent).toBe(owner!.world);
    expect(bob!.object('Crate').parent).toBe(bob!.world);
  });

  it('rejects a move whose claimed ancestors the owner refutes', async ({ skip }) => {
    if (!relayUp) skip();
    const [owner, mallory, bob] = await roomOfThree('Verify refuted move');
    await mallory.select('Crate');
    const seen = messagesTap(mallory!);
    const crate = idOf(mallory, 'Crate');
    const op = { k: 'reparent', ids: [crate], p: [idOf(mallory, 'Group B'), idOf(mallory, 'Group A')] };
    socketOf(mallory).send({
      t: 'edit',
      seq: 900003,
      ops: [{ ...op, d: { s: stateMoved(mallory, 'Crate', idOf(mallory, 'Group B')) } }],
    });
    await harnessCollaborationUntil(() => seen.some((m) => m.t === 'edit.rejected'), 3000, 'edit rejected');
    expect(seen.find((m) => m.t === 'edit.rejected')).toMatchObject({
      seq: 900003,
      reason: 'lock_unverified',
      why: 'invalid',
    });
    expect(parentOf(owner!, 'Crate')).toBe('');
    expect(parentOf(bob!, 'Crate')).toBe('');
  });

  it('serializes a verify flood, closes on overflow and keeps the room usable', async ({ skip }) => {
    if (!relayUp) skip();
    const [owner, mallory, bob] = await roomOfThree('Verify flood');
    const socket = socketOf(mallory);
    const crate = idOf(mallory, 'Crate');
    const flood = (count: number): Promise<SocketCollaborationMessage>[] =>
      Array.from({ length: count }, () =>
        socket.request({ t: 'lock.acquire', ids: [crate], replace: true, shared: [crypto.randomUUID()] }),
      );
    const replies = await Promise.all(flood(40));
    expect(replies.every((reply) => reply['code'] === 'lock_unverified')).toBe(true);
    expect(replies.every((reply) => reply['why'] === 'deleted' || reply['why'] === 'rate_limited')).toBe(true);
    await bob.select('Cube');
    const closed = new Promise<number>((resolve) => mallory!.socket?.once('close', (code) => resolve(code)));
    flood(100).forEach((reply) => reply.catch(() => undefined));
    expect(await closed).toBe(4002);
    await bob.select('Inner');
    await harnessRelayConverged([owner!, bob!]);
  });

  it('denies with owner_timeout when the owner does not answer, then recovers', async ({ skip }) => {
    if (!relayUp) skip();
    const [owner, , bob] = await roomOfThree('Verify owner timeout');
    const verify = owner!.runtime.session!.sync.verify;
    ownerMute(owner!);
    const started = Date.now();
    expect(bob!.selectTry('Cube')).toBe(true);
    await harnessCollaborationUntil(
      () => bob!.statuses.some((status) => status.includes('did not confirm the containers in time')),
      9000,
      'owner timeout status',
    );
    expect(Date.now() - started).toBeGreaterThanOrEqual(4500);
    expect(bob!.selection.getSelectedObjectCount()).toBe(0);
    owner!.runtime.session!.sync.verify = verify;
    await bob!.select('Cube');
  });

  it('denies pending verifications cleanly when the owner leaves', async ({ skip }) => {
    if (!relayUp) skip();
    const [owner, mallory] = await roomOfThree('Verify owner leaves');
    ownerMute(owner!);
    const pending = socketOf(mallory).request({
      t: 'lock.acquire',
      ids: [idOf(mallory, 'Cube')],
      replace: true,
      shared: [idOf(mallory, 'Group A')],
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const started = Date.now();
    owner!.drop();
    expect(await pending).toMatchObject({ ok: false, code: 'lock_unverified', why: 'owner_left' });
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it('retries a selection the owner refuted once, like a hierarchy race', async ({ skip }) => {
    if (!relayUp) skip();
    const [owner, , bob] = await roomOfThree('Verify retry');
    const sync = owner!.runtime.session!.sync;
    const verify = sync.verify.bind(sync);
    let refuted = 0;
    sync.verify = (message) => {
      if (refuted++ > 0) return verify(message);
      socketOf(owner!).send({ t: 'verify.result', q: message['q'], v: 'invalid' });
    };
    await bob!.select('Cube');
    expect(refuted).toBe(2);
  });

  it('tells MCP tools why a nested selection was not confirmed', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoomBuilt('Verify MCP', (client) => void client.solidAdd('Solid'));
    const alice = await harnessRelayJoin(room, 'Alice');
    ownerMute(owner);
    const brush = alice.solid('Solid').getBrushes()[0];
    if (brush === undefined) throw new Error('missing brush');
    const result = await alice.tool('select', { brushIds: [brush.id] });
    expect(result).toMatchObject({ ok: false, error: 'locked' });
    expect(String(result['message'])).toContain('did not confirm the containers in time');
  });
});
