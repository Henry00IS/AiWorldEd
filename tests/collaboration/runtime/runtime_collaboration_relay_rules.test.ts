import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { SessionCollaborationRoomInfo } from '@/collaboration/session/session_collaboration_types.js';
import { runtimeCollaborationJoinFailure } from '@/collaboration/runtime/runtime_collaboration_errors.js';
import { harnessCollaborationRelayUp, harnessCollaborationUntil } from './harness_collaboration_editor.js';
import {
  HARNESS_RELAY_REQUIRED,
  harnessRelayClient,
  harnessRelayClose,
  harnessRelayConverged,
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
 * Integration tests against the real local relay for the editing rules: locks,
 * rename-requires-lock, per-user undo, owner disconnect, private rooms and
 * reconnecting.
 */
describe('collaboration relay rules', { timeout: 20000 }, () => {
  it('refuses selecting an object another member holds and names the holder', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoom('Locks');
    const joiner = await harnessRelayJoin(room, 'Joiner');
    await owner.select('Seed');
    await harnessCollaborationUntil(() => joiner.holderOf('Seed') !== null);
    expect(await joiner.editTry('Seed')).toBe(false);
    expect(joiner.statuses.at(-1)).toContain('Locks owner');
    await owner.deselect();
    await harnessCollaborationUntil(() => joiner.holderOf('Seed') === null, 3000, 'lock released');
    await joiner.select('Seed');
    expect(joiner.holds(joiner.object('Seed'))).toBe(true);
  });

  it('lets both members select a contested object but grants its edit lease to exactly one', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoom('Race');
    const first = await harnessRelayJoin(room, 'First');
    const second = await harnessRelayJoin(room, 'Second');
    expect(first.selectTry('Seed')).toBe(true);
    expect(second.selectTry('Seed')).toBe(true);
    const granted = await Promise.all([first.editTry('Seed'), second.editTry('Seed')]);
    expect(granted.filter(Boolean)).toHaveLength(1);
    const settled = (): boolean => [owner, first, second].every((each) => each.holderOf('Seed') !== null);
    await harnessCollaborationUntil(settled, 3000, 'race settled');
    const winners = [first, second].filter((each) => each.holds(each.object('Seed')));
    expect(winners).toHaveLength(1);
    const holders = [owner, first, second].map((each) => each.holderOf('Seed'));
    expect(new Set(holders).size).toBe(1);
  });

  it('applies a one-shot rename without a lease (field-level, last writer wins)', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoom('Rename');
    const joiner = await harnessRelayJoin(room, 'Joiner');
    joiner.object('Seed').name = 'Sneaky';
    joiner.commit();
    await harnessCollaborationUntil(() => owner.find('Sneaky') !== undefined, 3000, 'rename synced');
    await harnessRelayConverged([owner, joiner]);
  });

  it('undoes only the undoing member’s own changes', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoom('Undo');
    const alice = await harnessRelayJoin(room, 'Alice');
    const bob = await harnessRelayJoin(room, 'Bob');
    await alice.select('Seed');
    alice.object('Seed').position.x = 2;
    alice.commit();
    await alice.deselect();
    bob.boxAdd('Bee').position.x = -2;
    bob.commit();
    await harnessCollaborationUntil(() => alice.find('Bee') !== undefined && bob.object('Seed').position.x === 2);
    alice.commandStack.undo();
    await harnessCollaborationUntil(() => owner.object('Seed').position.x === 0, 3000, 'undo applied');
    await harnessRelayConverged([owner, alice, bob]);
    expect(owner.find('Bee')).toBeDefined();
    expect(alice.object('Seed').position.x).toBe(0);
  });

  it('refuses an undo while another member holds an affected object', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoom('Refuse');
    const alice = await harnessRelayJoin(room, 'Alice');
    const bob = await harnessRelayJoin(room, 'Bob');
    await alice.select('Seed');
    alice.object('Seed').position.x = 3;
    alice.commit();
    await alice.deselect();
    await harnessCollaborationUntil(
      () => bob.object('Seed').position.x === 3 && bob.holderOf('Seed') === null,
      3000,
      'edit and release seen by Bob',
    );
    await bob.select('Seed');
    await harnessCollaborationUntil(
      () => alice.holderOf('Seed') !== null && alice.holderOf('Seed') === bob.holderOf('Seed'),
      3000,
      'lock seen by Alice',
    );
    expect(alice.commandStack.undo()).toBe(false);
    expect(alice.statuses.at(-1)).toBe(`Can't undo yet: Bob is editing "Seed"; try again when they are done`);
    expect(owner.object('Seed').position.x).toBe(3);
  });

  it('undoes only its own field when another member has since changed a different field', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoom('Skip');
    const alice = await harnessRelayJoin(room, 'Alice');
    const bob = await harnessRelayJoin(room, 'Bob');
    await alice.select('Seed');
    alice.object('Seed').position.x = 3;
    alice.commit();
    await alice.deselect();
    await harnessCollaborationUntil(
      () => bob.object('Seed').position.x === 3 && bob.holderOf('Seed') === null,
      3000,
      'edit and release seen by Bob',
    );
    await bob.select('Seed');
    bob.object('Seed').position.y = 4;
    bob.commit();
    await bob.deselect();
    await harnessCollaborationUntil(
      () => alice.object('Seed').position.y === 4 && alice.holderOf('Seed') === null,
      3000,
      'edit and release seen by Alice',
    );
    expect(alice.commandStack.undo()).toBe(true);
    await harnessCollaborationUntil(() => owner.object('Seed').position.x === 0, 3000, 'own field undone');
    await harnessRelayConverged([owner, alice, bob]);
    expect(owner.object('Seed').position.x).toBe(0);
    expect(owner.object('Seed').position.y).toBe(4);
  });

  it('warns joiners and keeps their scene when the owner disconnects', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoom('Closing');
    const joiner = await harnessRelayJoin(room, 'Joiner');
    owner.runtime.disconnect();
    await harnessCollaborationUntil(() => joiner.notices.length > 0, 3000, 'room closed notice');
    expect(joiner.notices[0]?.offline).toBe(true);
    expect(joiner.runtime.state).toBe('lobby');
    expect(joiner.find('Seed')).toBeDefined();
    joiner.object('Seed').position.x = 5;
    joiner.commit();
    expect(joiner.object('Seed').position.x).toBe(5);
  });

  it('protects private rooms with a password', async ({ skip }) => {
    if (!relayUp) skip();
    const owner = harnessRelayClient('Private owner');
    owner.boxAdd('Seed');
    await owner.runtime.create('Private', true, 'Correct-Horse-42');
    const room = owner.runtime.room?.id ?? '';
    const intruder = harnessRelayClient('Intruder');
    intruder.boxAdd('Mine');
    for (const attempt of ['Wrong-Horse-42', 'abc']) {
      const failure = await intruder.runtime.join(room, attempt).then(() => null, runtimeCollaborationJoinFailure);
      expect(failure).toEqual({ text: 'Wrong password.', retry: true });
    }
    expect(intruder.find('Mine')).toBeDefined();
    expect(intruder.runtime.password).toBe('');
    expect(owner.runtime.password).toBe('Correct-Horse-42');
    const guest = harnessRelayClient('Guest');
    await guest.runtime.join(room, 'Correct-Horse-42');
    await harnessCollaborationUntil(() => guest.runtime.state === 'room', 5000, 'guest synced');
    expect(guest.runtime.password).toBe('Correct-Horse-42');
    await harnessRelayConverged([owner, guest]);
    await owner.runtime.leave();
    expect(owner.runtime.password).toBe('');
  });

  it('clears the room status line when leaving the room', async ({ skip }) => {
    if (!relayUp) skip();
    const { room } = await harnessRelayRoom('Status');
    const joiner = await harnessRelayJoin(room, 'Joiner');
    await harnessCollaborationUntil(() => joiner.runtime.state === 'room', 5000, 'joiner synced');
    expect(joiner.statuses.at(-1)).toBe('Connected to room "Status"');
    joiner.runtime.status('Leave the current room first');
    await joiner.runtime.leave();
    expect(joiner.runtime.state).toBe('lobby');
    expect(joiner.statuses.at(-1)).toBe('');
  });

  it('reconnects a joiner after a network drop and resumes editing', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoom('Reconnect');
    const joiner = await harnessRelayJoin(room, 'Joiner');
    joiner.drop();
    await harnessCollaborationUntil(() => joiner.runtime.state === 'reconnecting', 3000, 'reconnecting');
    await harnessCollaborationUntil(() => joiner.runtime.state === 'room', 8000, 'rejoined');
    await joiner.select('Seed');
    joiner.object('Seed').position.z = 2;
    joiner.commit();
    await harnessCollaborationUntil(() => owner.object('Seed').position.z === 2, 3000, 'edit after reconnect');
    await harnessRelayConverged([owner, joiner]);
  });

  it('shows remote selections to other members', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoom('Visuals');
    const joiner = await harnessRelayJoin(room, 'Joiner');
    const before = owner.helpers.children.length;
    await joiner.select('Seed');
    await harnessCollaborationUntil(() => owner.helpers.children.length > before, 3000, 'remote selection overlay');
    await joiner.deselect();
    await harnessCollaborationUntil(() => owner.helpers.children.length === before, 3000, 'overlay removed');
  });

  it('pushes room list changes with the owner to subscribers until they unsubscribe', async ({ skip }) => {
    if (!relayUp) skip();
    const watcher = harnessRelayClient('Watcher');
    const seen: SessionCollaborationRoomInfo[][] = [];
    await watcher.runtime.roomsWatchStart({ update: (rooms) => seen.push(rooms), lost: () => undefined });
    const { owner, room } = await harnessRelayRoom('Watched');
    const listed = (): SessionCollaborationRoomInfo | undefined => seen.at(-1)?.find((each) => each.id === room);
    await harnessCollaborationUntil(() => listed() !== undefined, 3000, 'room pushed');
    expect(listed()?.owner).toBe('Watched owne');
    await harnessRelayJoin(room, 'Joiner');
    await harnessCollaborationUntil(() => listed()?.users === 2, 3000, 'member count pushed');
    await owner.runtime.leave();
    await harnessCollaborationUntil(() => listed() === undefined, 3000, 'room removal pushed');
    watcher.runtime.roomsUnwatch();
    const pushes = seen.length;
    await harnessRelayRoom('Unwatched');
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(seen).toHaveLength(pushes);
  });
});
