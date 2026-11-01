import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { NodeCollaborationState } from '@/collaboration/scene/node_collaboration_types.js';
import {
  type HarnessCollaborationEditor,
  harnessCollaborationRelayUp,
  harnessCollaborationUntil,
} from './harness_collaboration_editor.js';
import {
  HARNESS_RELAY_REQUIRED,
  harnessRelayClose,
  harnessRelayConverged,
  harnessRelayJoin,
  harnessRelayRoom,
} from './harness_collaboration_relay.js';

let relayUp = false;

beforeAll(async () => {
  relayUp = await harnessCollaborationRelayUp();
  if (!relayUp && HARNESS_RELAY_REQUIRED) throw new Error('collaboration relay is not reachable');
});

afterEach(harnessRelayClose);

/**
 * Sends a raw edit frame through a client's socket, bypassing the editor.
 *
 * @param client Sending client.
 * @param ops Raw operations.
 */
function rawEdit(client: HarnessCollaborationEditor, ops: object[]): void {
  const socket = (client.runtime as unknown as { client: { send(message: object): void } }).client;
  socket.send({ t: 'edit', seq: 900000, ops });
}

/**
 * Builds a new node state from the agreed state of Seed with a mutated entry.
 *
 * @param client Client whose baseline is copied.
 * @param name Name of the hostile node.
 * @param mutate Entry mutation.
 * @returns Hostile state.
 */
function hostileState(
  client: HarnessCollaborationEditor,
  name: string,
  mutate: (entry: Record<string, unknown>) => void,
): NodeCollaborationState {
  const replica = client.runtime.session?.sync.replica;
  const seed = replica?.baselines.get(client.nodeIdOf(client.object('Seed')))?.state;
  if (seed === undefined) throw new Error('Seed has no baseline');
  const state = JSON.parse(JSON.stringify(seed)) as NodeCollaborationState;
  state.id = crypto.randomUUID();
  const entry = (state.data as unknown as { entry: Record<string, unknown> }).entry;
  entry['name'] = name;
  entry['uuid'] = state.id;
  mutate(entry);
  return state;
}

/** Hostile members relaying payloads that would hang or crash other members. */
describe('collaboration relay hostile payloads', { timeout: 20000 }, () => {
  it('ignores a primitive with a huge segment count and stays in sync', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoom('Hostile segments');
    const attacker = await harnessRelayJoin(room, 'Attacker');
    const state = hostileState(attacker, 'Bomb', (entry) => {
      delete entry['geometryData'];
      entry['geometryType'] = 'sphere';
      entry['geometryParams'] = { radius: 1, widthSegments: 4000000, heightSegments: 4000 };
    });
    rawEdit(attacker, [{ k: 'create', ids: [state.id], d: { s: state } }]);
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(owner.find('Bomb')).toBeUndefined();
    await owner.select('Seed');
    owner.object('Seed').position.set(0, 3, 0);
    owner.commit();
    await harnessCollaborationUntil(() => attacker.object('Seed').position.y === 3, 3000, 'owner edit synced');
    await harnessRelayConverged([owner, attacker]);
  });

  it('ignores out-of-range mesh indices and huge coordinates', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoom('Hostile mesh');
    const attacker = await harnessRelayJoin(room, 'Attacker');
    const far = hostileState(attacker, 'Far', (entry) => {
      entry['position'] = { x: 1e300, y: 0, z: 0 };
    });
    const broken = hostileState(attacker, 'Broken', (entry) => {
      entry['geometryType'] = 'buffer';
      entry['geometryData'] = { position: [0, 0, 0, 1, 0, 0, 0, 1, 0], index: [0, 1, 99999999] };
    });
    rawEdit(
      attacker,
      [far, broken].map((state) => ({ k: 'create', ids: [state.id], d: { s: state } })),
    );
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(owner.find('Far')).toBeUndefined();
    expect(owner.find('Broken')).toBeUndefined();
  });
});
