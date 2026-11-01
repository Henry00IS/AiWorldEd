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
import { TextureLockSettings } from '@/texture/lock/texture_lock_settings.js';
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
 * Returns the vertex UVs of the crate mesh of a client.
 *
 * @param client Client.
 * @returns UV components.
 */
function uvs(client: HarnessCollaborationEditor): number[] {
  return Array.from(client.mesh('Crate').geometry.getAttribute('uv').array as ArrayLike<number>);
}

/**
 * Returns whether UV lists match closely.
 *
 * @param left First UVs.
 * @param right Second UVs.
 * @returns True when every value matches.
 */
function uvsMatch(left: readonly number[], right: readonly number[]): boolean {
  return (
    left.length > 0 &&
    left.length === right.length &&
    left.every((value, i) => Math.abs(value - (right[i] ?? NaN)) < 1e-6)
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
 * Applies one live scale frame to the crate the way the gizmo does, texture
 * lock policy included.
 *
 * @param client Dragging client.
 * @param locks Texture locks of the drag.
 * @param scale X scale.
 */
function scaleFrame(client: HarnessCollaborationEditor, locks: TextureLockFlags, scale: number): void {
  const mesh = client.mesh('Crate');
  mesh.scale.set(scale, 1, 1);
  mesh.updateMatrixWorld(true);
  new TextureLockSettings(locks.positionLock, locks.stretchLock).applyContentTransformPolicy([mesh], false, true);
}

/**
 * Waits until the peer shows a crate scale and the dragger's UVs.
 *
 * @param dragger Dragging client.
 * @param peer Watching client.
 * @param scale Expected X scale.
 * @param label Wait label.
 */
async function peerFollows(
  dragger: HarnessCollaborationEditor,
  peer: HarnessCollaborationEditor,
  scale: number,
  label: string,
): Promise<void> {
  await harnessCollaborationUntil(() => Math.abs(peer.mesh('Crate').scale.x - scale) < 1e-6, 3000, label);
  await harnessCollaborationUntil(() => uvsMatch(uvs(peer), uvs(dragger)), 3000, `${label} with the dragger UVs`);
}

const CASES = (['owner', 'member'] as const).flatMap((dragger) =>
  (
    [
      ['Stretch Lock off', { positionLock: true, stretchLock: false }],
      ['Stretch Lock on', { positionLock: true, stretchLock: true }],
    ] as const
  ).map(([label, locks]) => [dragger, label, locks] as const),
);

/** World mesh resizes keep the dragger's UVs on every peer. */
describe('texture locks of world mesh resizes over the relay', { timeout: 30000 }, () => {
  it.for(CASES)('the %s drags, %s: preview, commit, undo and redo', async ([side, label, locks], { skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoomBuilt(`mesh stretch ${side} ${label}`, (client) => {
      client.boxAdd('Crate');
    });
    const alice = await harnessRelayJoin(room, 'Alice');
    await harnessRelayConverged([owner, alice]);
    const [dragger, peer] = side === 'owner' ? [owner, alice] : [alice, owner];
    const start = uvs(peer);
    dragger.textureLocks = { ...locks };
    await dragger.select('Crate');
    pointerHold(dragger, true);
    const mesh = dragger.mesh('Crate');
    const before = captureTransformTextureState([mesh]);
    const inner = new CommandTransformScaleSet([mesh], [new THREE.Vector3(2, 1, 1)]);
    scaleFrame(dragger, locks, 1.5);
    await peerFollows(dragger, peer, 1.5, 'peer sees the drag');
    scaleFrame(dragger, locks, 2);
    await peerFollows(dragger, peer, 2, 'peer follows the drag');
    const stretched = uvs(dragger);
    expect(uvsMatch(stretched, start)).toBe(locks.stretchLock);
    dragger.commandStack.recordExecuted(
      new CommandTransformTextureLocked(inner, before, captureTransformTextureState([mesh])),
    );
    pointerHold(dragger, false);
    await harnessRelayConverged([owner, alice]);
    expect(uvs(peer)).toEqual(stretched);
    expect(dragger.commandStack.undo()).toBe(true);
    await peerFollows(dragger, peer, 1, 'undo seen');
    await harnessRelayConverged([owner, alice]);
    expect(uvsMatch(uvs(peer), start)).toBe(true);
    expect(dragger.commandStack.redo()).toBe(true);
    await peerFollows(dragger, peer, 2, 'redo seen');
    await harnessRelayConverged([owner, alice]);
    expect(uvs(peer)).toEqual(stretched);
  });
});
