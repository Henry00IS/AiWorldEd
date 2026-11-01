import * as THREE from 'three';
import WebSocketNode from 'ws';
import { PROTOCOL_ID, PROTOCOL_VERSION } from '@/collaboration/shared/protocol_definitions.js';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  HARNESS_COLLABORATION_ORIGIN,
  HARNESS_COLLABORATION_URL,
  harnessCollaborationRelayUp,
  harnessCollaborationUntil,
  type HarnessCollaborationEditor,
} from './harness_collaboration_editor.js';
import {
  HARNESS_RELAY_REQUIRED,
  harnessRelayClose,
  harnessRelayJoin,
  harnessRelayRoom,
} from './harness_collaboration_relay.js';

let relayUp = false;

/**
 * Asks the relay whether it supports presence (older relays leave the presence
 * rate out of the welcome limits).
 *
 * @returns True when the welcome advertises a presence rate.
 */
function relayPresence(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new WebSocketNode(HARNESS_COLLABORATION_URL, { origin: HARNESS_COLLABORATION_ORIGIN });
    const finish = (value: boolean): void => {
      socket.close();
      resolve(value);
    };
    socket.on('open', () =>
      socket.send(JSON.stringify({ t: 'hello', protocol: PROTOCOL_ID, version: PROTOCOL_VERSION, client: 'test' })),
    );
    socket.on('message', (data: Buffer) => finish(Number(JSON.parse(data.toString()).limits?.presencePerSecond) > 0));
    socket.on('error', () => finish(false));
  });
}

beforeAll(async () => {
  relayUp = await harnessCollaborationRelayUp();
  if (!relayUp && HARNESS_RELAY_REQUIRED) throw new Error('collaboration relay is not reachable');
  if (relayUp && !(await relayPresence())) {
    console.warn('collaboration relay predates presence; restart it from the current server code');
    relayUp = false;
  }
});

afterEach(harnessRelayClose);

/**
 * Returns the world position of the first remote camera gizmo a client shows.
 *
 * @param client Client.
 * @returns Gizmo position, or null when none is shown.
 */
function gizmoPosition(client: HarnessCollaborationEditor): THREE.Vector3 | null {
  const camera = client.helpers.children.find((child) => child.name.startsWith('Presence camera'));
  const gizmo = camera?.children[0];
  return gizmo === undefined ? null : gizmo.getWorldPosition(new THREE.Vector3());
}

/**
 * Integration tests against the real local relay for presence: remote viewport
 * cameras and play-mode characters, latest-only, cleared on leave.
 */
describe('collaboration relay presence', { timeout: 20000 }, () => {
  it('shows the latest camera pose of members after joining and follows it, then clears it on leave', async ({
    skip,
  }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoom('Presence');
    const view = new THREE.PerspectiveCamera(50, 1.5, 0.1, 100);
    view.position.set(1, 2, 3);
    owner.cameras.push(view);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const bob = await harnessRelayJoin(room, 'Bob');
    await harnessCollaborationUntil(() => gizmoPosition(bob)?.x === 1, 5000, 'catch-up presence');
    expect(bob.world.getObjectByName('Presence camera Presence') ?? null).toBeNull();
    view.position.set(7, 2, 3);
    await harnessCollaborationUntil(() => Math.abs((gizmoPosition(bob)?.x ?? 0) - 7) < 1e-3, 5000, 'moved');
    expect(gizmoPosition(owner)).toBeNull();
    await owner.runtime.leave();
    await harnessCollaborationUntil(() => bob.helpers.children.length === 0, 5000, 'cleared');
  });

  it('shows a play-mode member as a character with a name tag instead of their play camera', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoom('Play');
    const bob = await harnessRelayJoin(room, 'Bob');
    const play = new THREE.PerspectiveCamera(70, 1.5, 0.1, 100);
    bob.cameras.push(play);
    bob.player = {
      feet: new THREE.Vector3(4, 0, -2),
      yawRadians: 1,
      lookYawRadians: 1.5,
      pitchRadians: 0.4,
      grounded: true,
      wallPushing: false,
      running: false,
      camera: play,
    };
    const character = (): THREE.Object3D | undefined =>
      owner.helpers.children.find((child) => child.name === 'Presence character Bob');
    await harnessCollaborationUntil(() => character() !== undefined, 5000, 'character shown');
    expect(owner.helpers.children.some((child) => child.name.startsWith('Presence camera'))).toBe(false);
    expect(character()?.getObjectsByProperty('type', 'Sprite')).toHaveLength(1);
    bob.player = null;
    await harnessCollaborationUntil(() => character() === undefined, 5000, 'character removed');
    expect(owner.helpers.children.some((child) => child.name === 'Presence camera Bob')).toBe(true);
  });
});
