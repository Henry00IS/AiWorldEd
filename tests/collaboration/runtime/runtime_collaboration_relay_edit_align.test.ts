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
import { editAlignSelectionApply } from '@/edit/align/edit_align_apply.js';
import { EditSession } from '@/edit/session/edit_session.js';
import type { SolidModel } from '@/solid/model/solid_model.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';

let relayUp = false;

/**
 * Reads the highest brush vertex Y of a solid.
 *
 * @param model Solid model.
 * @returns Highest local Y.
 */
function topY(model: SolidModel): number {
  return Math.max(...(model.getBrushes()[0]?.brush.vertices.map((point) => point.y) ?? [0]));
}

beforeAll(async () => {
  relayUp = await harnessCollaborationRelayUp();
  if (!relayUp && HARNESS_RELAY_REQUIRED) throw new Error('collaboration relay is not reachable');
});

afterEach(harnessRelayClose);

/** An Edit Mode alignment reaches the room and undoes there as one step. */
describe('collaboration edit-mode align over the relay', { timeout: 20000 }, () => {
  it('syncs a flatten and its undo to the other client', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoomBuilt('edit align', (client) => {
      client.solidAdd('Solid');
    });
    const alice = await harnessRelayJoin(room, 'Alice');
    const solid = alice.solid('Solid');
    const instance = solid.getBrushes()[0];
    const mesh = instance?.mesh;
    if (instance === undefined || !(mesh instanceof THREE.Mesh)) throw new Error('brush without mesh');
    alice.selection.setSelection([mesh], []);
    const roomSession = alice.runtime.session;
    if (roomSession === null || roomSession === undefined) throw new Error('alice is not in the room');
    expect((await roomSession.sync.operationHold([alice.nodeIdOf(mesh)])).ok).toBe(true);
    await harnessCollaborationUntil(() => alice.holds(mesh), 5000, 'brush lease');
    const before = topY(owner.solid('Solid'));
    const session = new EditSession();
    expect(session.enter([solid.root])).toBe(true);
    const targetId = `brush:${instance.id}`;
    const keys = instance.brush.vertices.map((_, index) => String(index));
    session
      .getComponentSelection()
      .replaceAll(keys.map((componentKey) => ({ targetId, kind: 'vertex', componentKey })));
    const request = { kind: 'axis', axis: 'y', anchor: 'min' } as const;
    expect(editAlignSelectionApply(session, request, new GridSnap(true, 1), alice.commandStack, null)).toBe(
      keys.length,
    );
    alice.commit();
    await harnessCollaborationUntil(() => topY(owner.solid('Solid')) < before - 0.1, 3000, 'flatten synced');
    expect(alice.commandStack.undo()).toBe(true);
    await harnessCollaborationUntil(() => Math.abs(topY(owner.solid('Solid')) - before) < 1e-6, 3000, 'undo synced');
    await harnessRelayConverged([owner, alice]);
  });
});
