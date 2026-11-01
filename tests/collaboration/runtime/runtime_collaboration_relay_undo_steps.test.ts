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
import { CommandComponentPositions } from '@/edit/transform/command_component_positions.js';
import type { ComponentTransformBrushVertex } from '@/edit/transform/component_transform_vertex.js';
import type { SolidModel } from '@/solid/model/solid_model.js';

let relayUp = false;

/**
 * Pushes the +x vertices of the first brush outwards the way brush edit mode
 * does.
 *
 * @param model Solid model.
 * @returns Pushed command.
 */
function brushVerticesPush(model: SolidModel): CommandComponentPositions {
  const instance = model.getBrushes()[0];
  if (instance === undefined) throw new Error('solid without brushes');
  const vertices: ComponentTransformBrushVertex[] = [];
  instance.brush.vertices.forEach((point, vertexIndex) => {
    if (point.x <= 0) return;
    const initialLocal = point.clone();
    point.x *= 1.5;
    const brush = instance.brush;
    const base = { kind: 'brush' as const, targetId: `brush:${instance.id}`, vertexIndex, solidModel: model };
    vertices.push({ ...base, brushId: instance.id, brush, mesh: instance.mesh, initialLocal });
  });
  return new CommandComponentPositions(vertices);
}

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

  it('keeps the brush, its selection and its lock through an edit-mode undo', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoomBuilt('undo identity', (client) => {
      client.solidAdd('Solid');
    });
    const alice = await harnessRelayJoin(room, 'Alice');
    const instance = alice.solid('Solid').getBrushes()[0];
    const mesh = instance?.mesh;
    if (instance === undefined || !(mesh instanceof THREE.Mesh)) throw new Error('brush without mesh');
    alice.selection.setSelection([mesh], []);
    await harnessCollaborationUntil(() => alice.holds(mesh), 5000, 'brush lock');
    alice.commandStack.push(brushVerticesPush(alice.solid('Solid')));
    alice.commit();
    const ownerX = (): number =>
      Math.max(
        ...(owner
          .solid('Solid')
          .getBrushes()[0]
          ?.brush.vertices.map((p) => p.x) ?? [0]),
      );
    await harnessCollaborationUntil(() => ownerX() > 1.4, 3000, 'vertex move synced');
    expect(alice.commandStack.undo()).toBe(true);
    await harnessCollaborationUntil(() => ownerX() < 1.1, 3000, 'vertex move undone');
    const live = alice.solid('Solid').getBrushes()[0];
    expect(live?.mesh).toBe(mesh);
    expect(live?.brush).toBe(instance.brush);
    expect(Math.max(...instance.brush.vertices.map((p) => p.x))).toBeLessThan(1.1);
    expect(alice.selection.isObjectSelected(mesh)).toBe(true);
    expect(alice.holds(mesh)).toBe(true);
    await harnessRelayConverged([owner, alice]);
  });
});
