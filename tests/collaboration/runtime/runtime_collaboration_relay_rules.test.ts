import { afterEach, beforeAll, describe, expect, it } from 'vitest';
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
    expect(joiner.selectTry('Seed')).toBe(false);
    expect(joiner.statuses.at(-1)).toContain('Locks owner');
    await owner.deselect();
    await harnessCollaborationUntil(() => joiner.selectTry('Seed'), 3000, 'lock released');
    await joiner.select('Seed');
    expect(joiner.holds(joiner.object('Seed'))).toBe(true);
  });

  it('grants a contested object to exactly one member', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoom('Race');
    const first = await harnessRelayJoin(room, 'First');
    const second = await harnessRelayJoin(room, 'Second');
    first.selectTry('Seed');
    second.selectTry('Seed');
    const settled = (): boolean => [first, second].every((each) => each.holderOf('Seed') !== null);
    await harnessCollaborationUntil(settled, 3000, 'race settled');
    await new Promise((resolve) => setTimeout(resolve, 200));
    const winners = [first, second].filter((each) => each.holds(each.object('Seed')));
    expect(winners).toHaveLength(1);
    const holders = [owner, first, second].map((each) => each.holderOf('Seed'));
    expect(new Set(holders).size).toBe(1);
  });

  it('reverts a rename made without holding the object', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoom('Rename');
    const joiner = await harnessRelayJoin(room, 'Joiner');
    const seed = joiner.object('Seed');
    seed.name = 'Sneaky';
    joiner.commit();
    expect(seed.name).toBe('Seed');
    expect(joiner.statuses.at(-1)).toContain('Select an object before changing it');
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(owner.find('Sneaky')).toBeUndefined();
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
    await bob.select('Seed');
    expect(alice.commandStack.undo()).toBe(false);
    expect(alice.statuses.at(-1)).toBe('Cannot undo: Bob is editing an affected object');
    expect(owner.object('Seed').position.x).toBe(3);
  });

  it('skips an undo step another member has since overwritten', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoom('Skip');
    const alice = await harnessRelayJoin(room, 'Alice');
    const bob = await harnessRelayJoin(room, 'Bob');
    await alice.select('Seed');
    alice.object('Seed').position.x = 3;
    alice.commit();
    await alice.deselect();
    await bob.select('Seed');
    bob.object('Seed').position.y = 4;
    bob.commit();
    await bob.deselect();
    await harnessCollaborationUntil(() => alice.object('Seed').position.y === 4);
    alice.commandStack.undo();
    expect(alice.statuses.at(-1)).toBe('Skipped undo step: another member has since changed an affected object');
    await harnessRelayConverged([owner, alice, bob]);
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
});
