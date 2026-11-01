import * as THREE from 'three';
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
import type { TextureLockFlags } from '@/texture/lock/texture_lock_transform.js';
import { CommandTransformScaleSet } from '@/transform/commands/command_transform_scale_set.js';
import { CommandTransformTextureLocked } from '@/transform/commands/command_transform_texture_locked.js';
import { captureTransformTextureState } from '@/transform/commands/state_transform_texture.js';

let relayUp = false;

beforeAll(async () => {
  relayUp = await harnessCollaborationRelayUp();
  if (!relayUp && HARNESS_RELAY_REQUIRED) throw new Error('collaboration relay is not reachable');
});

afterEach(harnessRelayClose);

/**
 * Returns the mesh of the only brush of the solid.
 *
 * @param client Client.
 * @returns Brush mesh.
 */
function brushMesh(client: HarnessCollaborationEditor): THREE.Mesh {
  const mesh = client.solid('Solid').getBrushes()[0]?.mesh;
  if (mesh === undefined || mesh === null) throw new Error('solid without brush');
  return mesh;
}

/**
 * Serializes the UV matrices of the only brush of the solid.
 *
 * @param client Client.
 * @returns UV values of every face.
 */
function uvs(client: HarnessCollaborationEditor): number[] {
  const brush = client.solid('Solid').getBrushes()[0];
  if (brush === undefined) return [];
  return brush.brush.faces.flatMap((_face, index) => {
    const uv = brush.getFaceSurface(index).uv;
    return [...uv.u.toArray(), ...uv.v.toArray()];
  });
}

/**
 * Returns whether two clients show the same brush UVs.
 *
 * @param a First client.
 * @param b Second client.
 * @returns True when every UV value matches.
 */
function sameUvs(a: HarnessCollaborationEditor, b: HarnessCollaborationEditor): boolean {
  const left = uvs(a);
  const right = uvs(b);
  return (
    left.length > 0 && left.length === right.length && left.every((value, i) => Math.abs(value - right[i]!) < 1e-6)
  );
}

/**
 * Holds or releases a pointer on a client, as a gizmo drag does.
 *
 * @param client Client.
 * @param down True while dragging.
 */
function pointerHold(client: HarnessCollaborationEditor, down: boolean): void {
  (client.runtime.session as unknown as { pointersDown: number }).pointersDown = down ? 1 : 0;
}

/**
 * Applies one live scale frame on the dragging client the way the solid model
 * controller does.
 *
 * @param client Dragging client.
 * @param locks Texture locks of the drag.
 * @param scale X scale.
 */
function scaleFrame(client: HarnessCollaborationEditor, locks: TextureLockFlags, scale: number): void {
  const model = client.solid('Solid');
  const mesh = brushMesh(client);
  mesh.scale.set(scale, 1, 1);
  mesh.updateMatrixWorld(true);
  model.prepareLiveBrushEdit([mesh], locks);
  model.rebuildLive();
}

/** Brush resizes stream with the dragger's texture locks. */
describe('texture locks of live brush resizes over the relay', { timeout: 30000 }, () => {
  const cases: [string, TextureLockFlags][] = [
    ['Stretch Lock off', { positionLock: true, stretchLock: false }],
    ['Stretch Lock on', { positionLock: true, stretchLock: true }],
  ];
  it.for(cases)('peers preview, commit, undo and redo the dragger UVs: %s', async ([label, locks], { skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoomBuilt(`stretch lock ${label}`, (client) => {
      client.solidAdd('Solid');
    });
    const alice = await harnessRelayJoin(room, 'Alice');
    const clients = [owner, alice];
    await harnessRelayConverged(clients);
    const start = uvs(alice);
    alice.textureLocks = locks;
    await alice.select(brushMesh(alice).name);
    pointerHold(alice, true);
    const mesh = brushMesh(alice);
    const before = captureTransformTextureState([mesh]);
    const inner = new CommandTransformScaleSet([mesh], [new THREE.Vector3(2, 1, 1)]);
    scaleFrame(alice, locks, 1.5);
    await harnessCollaborationUntil(() => Math.abs(brushMesh(owner).scale.x - 1.5) < 1e-6, 3000, 'owner sees the drag');
    expect(sameUvs(owner, alice)).toBe(true);
    scaleFrame(alice, locks, 2);
    await harnessCollaborationUntil(
      () => Math.abs(brushMesh(owner).scale.x - 2) < 1e-6,
      3000,
      'owner follows the drag',
    );
    expect(sameUvs(owner, alice)).toBe(true);
    const stretched = uvs(alice);
    expect(stretched.every((value, i) => Math.abs(value - start[i]!) < 1e-6)).toBe(locks.stretchLock);
    alice.solid('Solid').finalizeAfterInteractiveEdit();
    alice.commandStack.recordExecuted(
      new CommandTransformTextureLocked(inner, before, captureTransformTextureState([mesh])),
    );
    pointerHold(alice, false);
    await harnessRelayConverged(clients);
    expect(sameUvs(owner, alice)).toBe(true);
    expect(alice.commandStack.undo()).toBe(true);
    await harnessCollaborationUntil(() => Math.abs(brushMesh(owner).scale.x - 1) < 1e-6, 3000, 'undo seen');
    await harnessRelayConverged(clients);
    expect(sameUvs(owner, alice)).toBe(true);
    expect(uvs(owner).every((value, i) => Math.abs(value - start[i]!) < 1e-6)).toBe(true);
    expect(alice.commandStack.redo()).toBe(true);
    await harnessCollaborationUntil(() => Math.abs(brushMesh(owner).scale.x - 2) < 1e-6, 3000, 'redo seen');
    await harnessRelayConverged(clients);
    expect(uvs(owner).every((value, i) => Math.abs(value - stretched[i]!) < 1e-6)).toBe(true);
  });
});
