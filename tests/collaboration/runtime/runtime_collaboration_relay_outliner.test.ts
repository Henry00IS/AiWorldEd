import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { harnessCollaborationRelayUp, harnessCollaborationUntil } from './harness_collaboration_editor.js';
import {
  HARNESS_RELAY_REQUIRED,
  harnessRelayClose,
  harnessRelayConverged,
  harnessRelayJoin,
  harnessRelayRoom,
} from './harness_collaboration_relay.js';
import { CommandObjectRename } from '@/outliner/commands/command_object_rename.js';
import { CommandObjectVisibilityToggle } from '@/outliner/commands/command_object_visibility_toggle.js';

let relayUp = false;

beforeAll(async () => {
  relayUp = await harnessCollaborationRelayUp();
  if (!relayUp && HARNESS_RELAY_REQUIRED) throw new Error('collaboration relay is not reachable');
});

afterEach(harnessRelayClose);

/**
 * Returns the revert guard messages a client showed.
 *
 * @param statuses Status messages.
 * @returns Revert messages.
 */
function reverts(statuses: readonly string[]): string[] {
  return statuses.filter((status) => status.startsWith('Select an object before changing it'));
}

/**
 * Integration tests for outliner row edits: they take the selection lock first
 * and are refused up front when another member holds the object.
 */
describe('collaboration relay outliner edits', { timeout: 20000 }, () => {
  it('selects and locks an unselected object before renaming it', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoom('Rename row');
    const bob = await harnessRelayJoin(room, 'Bob');
    const seed = bob.object('Seed');
    const applied = await bob.outlinerEdit('Seed', () => {
      expect(bob.holds(seed)).toBe(true);
      bob.commandStack.push(new CommandObjectRename(seed, 'BobCube'));
    });
    expect(applied).toBe(true);
    expect(bob.selection.getInspectorObjects()).toContain(seed);
    await harnessCollaborationUntil(() => owner.find('BobCube') !== undefined, 3000, 'rename relayed');
    bob.commit();
    expect(seed.name).toBe('BobCube');
    expect([...reverts(owner.statuses), ...reverts(bob.statuses)]).toEqual([]);
    await harnessRelayConverged([owner, bob]);
  });

  it('toggles visibility of an unselected object after locking it', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoom('Hide row');
    const bob = await harnessRelayJoin(room, 'Bob');
    const seed = bob.object('Seed');
    expect(await bob.outlinerEdit('Seed', () => bob.commandStack.push(new CommandObjectVisibilityToggle(seed)))).toBe(
      true,
    );
    await harnessCollaborationUntil(() => owner.object('Seed').visible === false, 3000, 'visibility relayed');
    bob.commit();
    expect(seed.visible).toBe(false);
    expect(reverts(bob.statuses)).toEqual([]);
  });

  it('refuses an edit of an object another member holds without applying it', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoom('Held row');
    const bob = await harnessRelayJoin(room, 'Bob');
    await owner.select('Seed');
    await harnessCollaborationUntil(() => bob.holderOf('Seed') !== null, 3000, 'lock relayed');
    let ran = false;
    expect(await bob.outlinerEdit('Seed', () => (ran = true))).toBe(false);
    expect(ran).toBe(false);
    expect(bob.statuses.at(-1)).toBe('"Seed" is being edited by Held row owner');
    expect(bob.selection.getInspectorObjects()).toEqual([]);
    expect(bob.commandStack.getUndoCount()).toBe(0);
  });

  it('applies an edit of an object it already holds right away', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoom('Own row');
    const bob = await harnessRelayJoin(room, 'Bob');
    await bob.select('Seed');
    let ran = false;
    void bob.outlinerEdit('Seed', () => (ran = true));
    expect(ran).toBe(true);
    await harnessRelayConverged([owner, bob]);
  });
});
