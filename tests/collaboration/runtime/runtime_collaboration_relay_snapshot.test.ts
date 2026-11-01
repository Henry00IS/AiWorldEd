import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { SnapshotCollaborationOwner } from '@/collaboration/snapshot/owner_collaboration_snapshot.js';
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

/** Loose boxes in the test scene; more than the large-deletion threshold. */
const SNAPSHOT_TEST_BOXES = 30;

let relayUp = false;

beforeAll(async () => {
  relayUp = await harnessCollaborationRelayUp();
  if (!relayUp && HARNESS_RELAY_REQUIRED) throw new Error('collaboration relay is not reachable');
});

afterEach(harnessRelayClose);

/**
 * Builds loose boxes, Group A holding Cube, and a Crate.
 *
 * @param owner Owner client.
 */
function sceneBuild(owner: HarnessCollaborationEditor): void {
  for (let index = 0; index < SNAPSHOT_TEST_BOXES; index += 1) owner.boxAdd(`Box ${index}`).position.set(index, 0, 0);
  owner.boxAdd('Cube', owner.groupAdd('Group A'));
  owner.boxAdd('Crate').position.set(-4, 0, 0);
}

/**
 * Returns the owner's snapshot keeper.
 *
 * @param owner Owner client.
 * @returns Snapshot keeper.
 */
function snapshotsOf(owner: HarnessCollaborationEditor): SnapshotCollaborationOwner {
  const session = owner.runtime.session;
  if (session === null) throw new Error('owner is not in a room');
  return session.snapshots;
}

/**
 * Lets a member delete the first boxes, as a griefer would.
 *
 * @param member Member.
 * @param count Boxes to delete.
 */
async function boxesDelete(member: HarnessCollaborationEditor, count: number): Promise<void> {
  const names = Array.from({ length: count }, (_, index) => `Box ${index}`);
  await member.select(...names);
  names.forEach((name) => member.world.remove(member.object(name)));
  member.commit();
  await member.deselect();
}

/**
 * Counts the boxes a client shows.
 *
 * @param client Client.
 * @returns Box count.
 */
function boxCount(client: HarnessCollaborationEditor): number {
  return client.world.children.filter((child) => child.name.startsWith('Box ')).length;
}

/** Relay tests for the owner's scene snapshots and restore. */
describe('collaboration room snapshots over the relay', { timeout: 30000 }, () => {
  it('restores a snapshot for everyone, keeps held objects, and undoes as one step', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoomBuilt('snapshot restore', sceneBuild);
    const alice = await harnessRelayJoin(room, 'Alice');
    const bob = await harnessRelayJoin(room, 'Bob');
    const clients = [owner, alice, bob];
    const snapshot = await snapshotsOf(owner).take('manual');
    if (snapshot === null) throw new Error('no snapshot');
    expect(snapshot.count).toBe(SNAPSHOT_TEST_BOXES + 3);
    await boxesDelete(alice, 25);
    await alice.select('Crate');
    alice.object('Crate').position.set(9, 9, 9);
    alice.boxAdd('Graffiti');
    alice.commit();
    await harnessCollaborationUntil(() => alice.holds(alice.object('Graffiti')), 5000, 'graffiti created');
    alice.selection.clearSelection();
    await alice.deselect();
    await bob.select('Cube');
    bob.object('Cube').position.set(0, 5, 0);
    bob.commit();
    await harnessCollaborationUntil(() => owner.find('Graffiti') !== undefined && boxCount(owner) === 5, 5000, 'grief');
    await harnessCollaborationUntil(() => owner.object('Cube').position.y === 5, 5000, 'cube moved');
    await harnessCollaborationUntil(() => owner.holderOf('Graffiti') === null, 5000, 'graffiti released');
    expect((await snapshotsOf(owner).list()).map((meta) => meta.reason)).toContain('large-change');
    const report = await snapshotsOf(owner).restore(snapshot.id);
    expect(report.ok).toBe(true);
    expect(report.skipped.map((skip) => [skip.id, skip.holder])).toEqual([
      [bob.nodeIdOf(bob.object('Cube')), bob.runtime.session?.sync.replica.locks.selfGet()],
    ]);
    await harnessCollaborationUntil(
      () => clients.every((client) => boxCount(client) === SNAPSHOT_TEST_BOXES),
      5000,
      'restored',
    );
    await harnessRelayConverged(clients);
    clients.forEach((client) => {
      expect(client.find('Graffiti')).toBeUndefined();
      expect(client.object('Crate').position.toArray()).toEqual([-4, 0, 0]);
      expect(client.object('Cube').position.toArray()).toEqual([0, 5, 0]);
    });
    owner.commandStack.undo();
    await harnessCollaborationUntil(() => clients.every((client) => boxCount(client) === 5), 5000, 'undone');
    await harnessRelayConverged(clients);
    clients.forEach((client) => expect(client.find('Graffiti')).toBeDefined());
    expect((await snapshotsOf(owner).list()).map((meta) => meta.reason)).toContain('before-restore');
  });

  it('restores with two clients after a member deleted most of the scene', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoomBuilt('snapshot two', sceneBuild);
    const alice = await harnessRelayJoin(room, 'Alice');
    await new Promise((resolve) => setTimeout(resolve, 100));
    const [start] = await snapshotsOf(owner).list();
    expect(start?.reason).toBe('room-start');
    await boxesDelete(alice, SNAPSHOT_TEST_BOXES);
    await harnessCollaborationUntil(() => boxCount(owner) === 0, 5000, 'deleted');
    const report = await snapshotsOf(owner).restore(start!.id);
    expect(report).toMatchObject({ ok: true, restored: SNAPSHOT_TEST_BOXES, skipped: [] });
    await harnessCollaborationUntil(() => boxCount(alice) === SNAPSHOT_TEST_BOXES, 5000, 'restored');
    await harnessRelayConverged([owner, alice]);
    expect(owner.runtime.session?.sync.replica.locks.idsOf(owner.runtime.session.sync.replica.locks.selfGet())).toEqual(
      [],
    );
  });
});
