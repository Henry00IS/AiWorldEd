import * as THREE from 'three';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { harnessCollaborationRelayUp, harnessCollaborationUntil } from './harness_collaboration_editor.js';
import {
  HARNESS_RELAY_REQUIRED,
  harnessRelayClose,
  harnessRelayConverged,
  harnessRelayJoin,
  harnessRelayRoomBuilt,
} from './harness_collaboration_relay.js';
import { CommandTransformPositionSet } from '@/transform/commands/command_transform_position_set.js';

let relayUp = false;

beforeAll(async () => {
  relayUp = await harnessCollaborationRelayUp();
  if (!relayUp && HARNESS_RELAY_REQUIRED) throw new Error('collaboration relay is not reachable');
});

afterEach(harnessRelayClose);

/**
 * One editor command is one undo step in a room, including its follow-up
 * changes.
 */
describe('collaboration undo steps over the relay', { timeout: 20000 }, () => {
  it('folds changes made right after a command into its undo step', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoomBuilt('undo steps', (client) => {
      client.boxAdd('Crate');
    });
    const alice = await harnessRelayJoin(room, 'Alice');
    await alice.select('Crate');
    const crate = alice.object('Crate');
    const before = alice.commandStack.getUndoCount();
    for (const x of [3, 5, 7]) {
      alice.commandStack.push(new CommandTransformPositionSet([crate], [new THREE.Vector3(x, 0, 0)]));
      crate.scale.setScalar(x);
      await Promise.resolve();
      alice.commit();
    }
    expect(alice.commandStack.getUndoCount()).toBe(before + 3);
    await harnessCollaborationUntil(() => owner.object('Crate').scale.x === 7, 3000, 'side effect synced');
    expect(alice.commandStack.undo()).toBe(true);
    await harnessCollaborationUntil(() => owner.object('Crate').position.x === 5, 3000, 'one step undone');
    expect(owner.object('Crate').scale.x).toBe(5);
    expect(alice.commandStack.getUndoCount()).toBe(before + 2);
    await harnessRelayConverged([owner, alice]);
  });
});
