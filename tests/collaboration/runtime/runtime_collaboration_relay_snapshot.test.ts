import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SnapshotCollaborationOwner } from '@/collaboration/snapshot/owner_collaboration_snapshot.js';
import {
  harnessCollaborationRelayUp,
  harnessCollaborationUntil,
  type HarnessCollaborationEditor,
} from './harness_collaboration_editor.js';
import {
  HARNESS_RELAY_REQUIRED,
  harnessRelayClose,
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

/**
 * Reads the room saves of the owner, oldest first.
 *
 * @param client Room owner.
 * @returns Saves.
 */
async function savesOf(client: HarnessCollaborationEditor) {
  return (await (await snapshotsOf(client).store()).entries()).sort((left, right) => left.time - right.time);
}

/** Relay tests for the room history every member records. */
describe('collaboration room snapshots over the relay', { timeout: 30000 }, () => {
  it('saves the room before a large relayed deletion', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoomBuilt('snapshot large', sceneBuild);
    const alice = await harnessRelayJoin(room, 'Alice');
    const snapshot = await snapshotsOf(owner).take('joined');
    if (snapshot === null) throw new Error('no snapshot');
    expect(snapshot).toMatchObject({ kind: 'snapshot', source: 'room', objectCount: SNAPSHOT_TEST_BOXES + 3 });
    const before = (await savesOf(owner)).length;
    await boxesDelete(alice, 25);
    await harnessCollaborationUntil(() => boxCount(owner) === SNAPSHOT_TEST_BOXES - 25, 5000, 'deleted');
    expect((await savesOf(owner)).length).toBeGreaterThan(before);
    expect((await savesOf(owner)).every((entry) => entry.source === 'room')).toBe(true);
  });

  it('gives every member a snapshot of the room once fully joined', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoomBuilt('snapshot join', sceneBuild);
    const alice = await harnessRelayJoin(room, 'Alice');
    await vi.waitFor(async () => expect(await savesOf(alice)).toHaveLength(1), { timeout: 5000 });
    const [joined] = await savesOf(alice);
    expect(joined).toMatchObject({ kind: 'snapshot', source: 'room', objectCount: SNAPSHOT_TEST_BOXES + 3 });
    expect(await snapshotsOf(owner).store()).not.toBe(await snapshotsOf(alice).store());
  });
});
