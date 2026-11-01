import { afterEach, beforeAll, describe, expect, it } from 'vitest';
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
 * Creates the room and joins Alice and Bob.
 *
 * @param name Room name.
 * @returns Owner, Alice and Bob.
 */
async function roomOfThree(name: string): Promise<HarnessCollaborationEditor[]> {
  const { owner, room } = await harnessRelayRoomBuilt(name, sceneBuild);
  const alice = await harnessRelayJoin(room, 'Alice');
  const bob = await harnessRelayJoin(room, 'Bob');
  return [owner, alice, bob];
}

/**
 * Lets Bob select objects and waits until Alice sees his locks.
 *
 * @param alice Alice.
 * @param bob Bob.
 * @param names Object names.
 */
async function bobHolds(
  alice: HarnessCollaborationEditor,
  bob: HarnessCollaborationEditor,
  ...names: string[]
): Promise<void> {
  await bob.select(...names);
  await harnessCollaborationUntil(
    () => names.every((name) => alice.holderOf(name) === bob.holderOf(name)),
    3000,
    'lock seen',
  );
}

/**
 * Reads the parent name of an object.
 *
 * @param client Client.
 * @param name Object name.
 * @returns Parent name.
 */
function parentOf(client: HarnessCollaborationEditor, name: string): string {
  return client.object(name).parent?.name ?? '';
}

/** Relay tests for locks that cover whole subtrees. */
describe('collaboration hierarchical locks over the relay', { timeout: 20000 }, () => {
  it('refuses selecting a group while another member edits an object inside it', async ({ skip }) => {
    if (!relayUp) skip();
    const [, alice, bob] = await roomOfThree('hier child');
    await bobHolds(alice!, bob!, 'Cube');
    expect(await alice!.editTry('Group A')).toBe(false);
    expect(alice!.statuses.at(-1)).toBe(
      `Can't edit "Group A" yet: Bob is editing "Cube" inside it; try again when they are done`,
    );
  });

  it('refuses selecting an object inside a group another member edits', async ({ skip }) => {
    if (!relayUp) skip();
    const [, alice, bob] = await roomOfThree('hier parent');
    await bobHolds(alice!, bob!, 'Group A');
    expect(await alice!.editTry('Cube')).toBe(false);
    expect(alice!.statuses.at(-1)).toBe(
      `Can't edit "Cube" yet: Bob is editing "Group A" around it; try again when they are done`,
    );
  });

  it('refuses an outliner drop into a group another member edits and keeps the scene', async ({ skip }) => {
    if (!relayUp) skip();
    const [owner, alice, bob] = await roomOfThree('hier drop');
    await bobHolds(alice!, bob!, 'Group B');
    const moved = await alice!.outlinerMove(['Crate'], 'Group B', () =>
      alice!.object('Group B').attach(alice!.object('Crate')),
    );
    expect(moved).toBe(false);
    expect(alice!.statuses.at(-1)).toContain('Bob is editing');
    await harnessRelayConverged([owner!, alice!, bob!]);
    expect(parentOf(owner!, 'Crate')).toBe(parentOf(alice!, 'Crate'));
    expect(parentOf(alice!, 'Crate')).not.toBe('Group B');
  });

  it('refuses dragging a group whose child another member edits', async ({ skip }) => {
    if (!relayUp) skip();
    const [owner, alice, bob] = await roomOfThree('hier drag');
    await bobHolds(alice!, bob!, 'Cube');
    const moved = await alice!.outlinerMove(['Group A'], 'Group B', () =>
      alice!.object('Group B').attach(alice!.object('Group A')),
    );
    expect(moved).toBe(false);
    expect(alice!.statuses.at(-1)).toContain('Bob is editing "Cube" inside it');
    await harnessRelayConverged([owner!, alice!, bob!]);
    expect(parentOf(owner!, 'Group A')).not.toBe('Group B');
  });

  it('allows dropping into a group while another member edits a different child', async ({ skip }) => {
    if (!relayUp) skip();
    const [owner, alice, bob] = await roomOfThree('hier sibling');
    await bobHolds(alice!, bob!, 'Inner');
    const moved = await alice!.outlinerMove(['Crate'], 'Group B', () =>
      alice!.object('Group B').attach(alice!.object('Crate')),
    );
    expect(moved).toBe(true);
    alice!.commit();
    await harnessCollaborationUntil(() => parentOf(owner!, 'Crate') === 'Group B', 3000, 'drop synced');
    await harnessRelayConverged([owner!, alice!, bob!]);
  });

  it('reverts a reparent into a held group even when it bypasses the outliner', async ({ skip }) => {
    if (!relayUp) skip();
    const [owner, alice, bob] = await roomOfThree('hier bypass');
    await alice!.select('Crate');
    await bobHolds(alice!, bob!, 'Group B');
    alice!.object('Group B').attach(alice!.object('Crate'));
    alice!.commit();
    await harnessCollaborationUntil(() => parentOf(alice!, 'Crate') !== 'Group B', 3000, 'reverted');
    await harnessRelayConverged([owner!, alice!, bob!]);
    expect(parentOf(bob!, 'Crate')).not.toBe('Group B');
  });

  it('refuses grouping an object into a new group inside a held group', async ({ skip }) => {
    if (!relayUp) skip();
    const [owner, alice, bob] = await roomOfThree('hier group');
    await alice!.select('Crate');
    await bobHolds(alice!, bob!, 'Group B');
    const folder = alice!.groupAdd('Folder');
    alice!.object('Group B').add(folder);
    folder.attach(alice!.object('Crate'));
    alice!.commit();
    await harnessCollaborationUntil(() => alice!.find('Folder') === undefined, 3000, 'group reverted');
    await harnessRelayConverged([owner!, alice!, bob!]);
    expect(owner!.find('Folder')).toBeUndefined();
  });

  it('groups and ungroups free objects and syncs both steps', async ({ skip }) => {
    if (!relayUp) skip();
    const [owner, alice, bob] = await roomOfThree('hier ungroup');
    await bobHolds(alice!, bob!, 'Cube');
    await alice!.select('Crate');
    const folder = alice!.groupAdd('Folder');
    folder.attach(alice!.object('Crate'));
    alice!.commit();
    await harnessCollaborationUntil(() => parentOf(owner!, 'Crate') === 'Folder', 3000, 'grouped');
    alice!.world.attach(alice!.object('Crate'));
    alice!.world.remove(folder);
    alice!.commit();
    await harnessCollaborationUntil(() => owner!.find('Folder') === undefined, 3000, 'ungrouped');
    await harnessRelayConverged([owner!, alice!, bob!]);
    expect(parentOf(owner!, 'Cube')).toBe('Group A');
  });

  it('refuses an undo that would move an object back into a held group', async ({ skip }) => {
    if (!relayUp) skip();
    const [owner, alice, bob] = await roomOfThree('hier undo');
    const moved = await alice!.outlinerMove(['Inner'], '', () => alice!.world.attach(alice!.object('Inner')));
    expect(moved).toBe(true);
    alice!.commit();
    await harnessCollaborationUntil(() => parentOf(owner!, 'Inner') !== 'Group B', 3000, 'moved out');
    await alice!.deselect();
    await bobHolds(alice!, bob!, 'Group B');
    expect(alice!.commandStack.undo()).toBe(false);
    expect(alice!.statuses.at(-1)).toContain('Bob');
    await harnessRelayConverged([owner!, alice!, bob!]);
    expect(parentOf(owner!, 'Inner')).not.toBe('Group B');
  });
});
