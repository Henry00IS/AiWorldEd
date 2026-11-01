import * as THREE from 'three';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { harnessCollaborationRelayUp, harnessCollaborationUntil } from './harness_collaboration_editor.js';
import {
  HARNESS_RELAY_REQUIRED,
  harnessRelayClose,
  harnessRelayConverged,
  harnessRelayJoin,
  harnessRelayRoom,
} from './harness_collaboration_relay.js';
import { CommandObjectRename } from '@/outliner/commands/command_object_rename.js';
import { currentSharedContentMaterialList } from '@/viewports/shared/shared_content_material_store.js';

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
 * Integration tests against the real local relay for what a member sees when
 * someone else edits: no revert guard, no history and no stray status.
 */
describe('collaboration relay remote edits', { timeout: 20000 }, () => {
  it('does not mistake a wireframe shading pass for an edit of an unselected object', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoom('Shading');
    const bob = await harnessRelayJoin(room, 'Bob');
    const content = currentSharedContentMaterialList(owner.mesh('Seed'))[0];
    owner.shadingOverride();
    owner.commit();
    expect(reverts(owner.statuses)).toEqual([]);
    await bob.select('Seed');
    bob.commandStack.push(new CommandObjectRename(bob.object('Seed'), 'BobCube'));
    await harnessCollaborationUntil(() => owner.find('BobCube') !== undefined, 3000, 'rename relayed');
    owner.shadingOverride();
    owner.commit();
    expect(reverts(owner.statuses)).toEqual([]);
    expect(currentSharedContentMaterialList(owner.mesh('BobCube'))[0]).toBe(content);
    expect(owner.mesh('BobCube').material).toBeInstanceOf(THREE.MeshBasicMaterial);
    await harnessRelayConverged([owner, bob]);
  });

  it("keeps another member's edits and undo out of local history and status", async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoom('Foreign');
    const bob = await harnessRelayJoin(room, 'Bob');
    const undo = owner.commandStack.getUndoCount();
    const redo = owner.commandStack.getRedoCount();
    const statuses = owner.statuses.length;
    await bob.select('Seed');
    bob.commandStack.push(new CommandObjectRename(bob.object('Seed'), 'BobCube'));
    await harnessCollaborationUntil(() => owner.find('BobCube') !== undefined, 3000, 'rename relayed');
    expect(bob.commandStack.undo()).toBe(true);
    await harnessCollaborationUntil(() => owner.find('Seed') !== undefined, 3000, 'undo relayed');
    owner.commit();
    expect([owner.commandStack.getUndoCount(), owner.commandStack.getRedoCount()]).toEqual([undo, redo]);
    expect(owner.statuses.slice(statuses)).toEqual([]);
    await harnessRelayConverged([owner, bob]);
  });

  it('refreshes the undo counter on every collaboration step', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoom('Counter');
    const bob = await harnessRelayJoin(room, 'Bob');
    const counts = vi.fn();
    bob.commandStack.onStackChanged(counts);
    await bob.select('Seed');
    bob.commandStack.push(new CommandObjectRename(bob.object('Seed'), 'BobCube'));
    await Promise.resolve();
    expect(counts).toHaveBeenLastCalledWith(1, 0);
    expect(bob.commandStack.undo()).toBe(true);
    expect(counts).toHaveBeenLastCalledWith(0, 1);
    expect(bob.commandStack.redo()).toBe(true);
    expect(counts).toHaveBeenLastCalledWith(1, 0);
    await harnessRelayConverged([owner, bob]);
  });

  it('clears a stale lock refusal once the holder lets go', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoom('Refuse');
    const bob = await harnessRelayJoin(room, 'Bob');
    await owner.select('Seed');
    await harnessCollaborationUntil(() => bob.holderOf('Seed') !== null, 3000, 'lock relayed');
    expect(await bob.editTry('Seed')).toBe(false);
    expect(bob.statuses.at(-1)).toBe('"Seed" is being edited by Refuse owner');
    await owner.deselect();
    await harnessCollaborationUntil(() => bob.statuses.at(-1) === '', 3000, 'refusal cleared');
    await bob.select('Seed');
  });
});
