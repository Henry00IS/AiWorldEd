import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { harnessCollaborationRelayUp, harnessCollaborationUntil } from './harness_collaboration_editor.js';
import {
  HARNESS_RELAY_REQUIRED,
  harnessRelayClient,
  harnessRelayClose,
  harnessRelayConverged,
  harnessRelayJoin,
} from './harness_collaboration_relay.js';

let relayUp = false;
beforeAll(async () => {
  relayUp = await harnessCollaborationRelayUp();
  if (!relayUp && HARNESS_RELAY_REQUIRED) throw new Error('collaboration relay is not reachable');
});
afterEach(harnessRelayClose);

/**
 * Real three-client convergence, live grant/revoke and room-only kick
 * regression.
 */
describe('room edit permissions', { timeout: 20000 }, () => {
  it('keeps viewers synchronized after tool spam, enables editors and revokes mid-lease', async ({ skip }) => {
    if (!relayUp) skip();
    const owner = harnessRelayClient('Permission owner');
    owner.boxAdd('Seed');
    await owner.runtime.create('Permission test', false, '');
    const id = owner.runtime.room?.id ?? '';
    const editor = await harnessRelayJoin(id, 'Approved editor');
    const viewer = await harnessRelayJoin(id, 'Viewer');
    await owner.runtime.permissionSet(editor.runtime.user(), true);
    await harnessCollaborationUntil(() => editor.runtime.session?.sync.canEdit() === true);
    expect(viewer.runtime.session?.sync.canEdit()).toBe(false);
    for (let index = 0; index < 8; index++) {
      viewer.object('Seed').position.x += 4;
      viewer.object('Seed').name = 'Not permitted';
      viewer.commit();
      viewer.boxAdd('Forbidden');
      viewer.commit();
      viewer.object('Seed').removeFromParent();
      viewer.commit();
      expect(viewer.commandStack.undo()).toBe(false);
      expect(viewer.commandStack.redo()).toBe(false);
    }
    await harnessRelayConverged([owner, editor, viewer]);
    editor.object('Seed').position.x = 6;
    editor.commit();
    await harnessCollaborationUntil(() => owner.object('Seed').position.x === 6);
    await owner.runtime.permissionSet(viewer.runtime.user(), true);
    await harnessCollaborationUntil(() => viewer.runtime.session?.sync.canEdit() === true);
    await viewer.editTry('Seed');
    viewer.object('Seed').position.x = 12;
    viewer.runtime.session?.sync.liveTick();
    await owner.runtime.permissionSet(viewer.runtime.user(), false);
    await harnessCollaborationUntil(() => viewer.runtime.session?.sync.canEdit() === false);
    await harnessRelayConverged([owner, editor, viewer]);
    expect(owner.object('Seed').position.x).toBe(6);
    await owner.runtime.permissionSet(viewer.runtime.user(), true);
    await harnessCollaborationUntil(() => viewer.runtime.session?.sync.canEdit() === true);
    viewer.object('Seed').position.x = 9;
    viewer.commit();
    await harnessCollaborationUntil(() => owner.object('Seed').position.x === 9);
    await harnessRelayConverged([owner, editor, viewer]);
    await owner.runtime.memberKick(viewer.runtime.user());
    await harnessCollaborationUntil(() => viewer.runtime.state === 'lobby');
    expect(viewer.socket?.readyState).toBe(1);
    expect((await viewer.runtime.rooms()).some((room) => room.id === id)).toBe(true);
    expect(viewer.runtime.session).toBe(null);
  });
});
