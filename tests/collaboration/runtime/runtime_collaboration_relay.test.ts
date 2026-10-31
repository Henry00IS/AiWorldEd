import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  HarnessCollaborationEditor,
  harnessCollaborationRelayUp,
  harnessCollaborationUntil,
} from './harness_collaboration_editor.js';

const required = process.env['AIWORLDED_COLLAB_REQUIRED'] === '1';
let relayUp = false;
const clients: HarnessCollaborationEditor[] = [];

/**
 * Creates a tracked client.
 *
 * @param name Display name.
 * @returns Client.
 */
function client(name: string): HarnessCollaborationEditor {
  const created = new HarnessCollaborationEditor(name);
  clients.push(created);
  return created;
}

/**
 * Creates a public room owned by a new client that has one box.
 *
 * @param name Room name.
 * @returns Owner client and room id.
 */
async function roomOpen(name: string): Promise<{ owner: HarnessCollaborationEditor; room: string }> {
  const owner = client(`${name} owner`);
  owner.boxAdd('Seed');
  await owner.runtime.create(name, false, '');
  const room = owner.runtime.room?.id ?? '';
  return { owner, room };
}

/**
 * Joins a room with a new client and waits until it is synced.
 *
 * @param room Room id.
 * @param name Display name.
 * @returns Client.
 */
async function joinSynced(room: string, name: string): Promise<HarnessCollaborationEditor> {
  const joiner = client(name);
  await joiner.runtime.join(room, '');
  await harnessCollaborationUntil(() => joiner.runtime.state === 'room', 5000, `${name} synced`);
  return joiner;
}

/**
 * Waits until every client shows the same scene.
 *
 * @param list Clients.
 */
async function converged(list: HarnessCollaborationEditor[]): Promise<void> {
  const [first] = list;
  if (first === undefined) return;
  await harnessCollaborationUntil(
    () => list.every((other) => other.fingerprint() === first.fingerprint()),
    5000,
    `convergence\n${list.map((each) => each.fingerprint()).join('\n---\n')}`,
  );
}

beforeAll(async () => {
  relayUp = await harnessCollaborationRelayUp();
  if (!relayUp && required) throw new Error('collaboration relay is not reachable');
});

afterEach(async () => {
  await Promise.all(clients.splice(0).map((each) => each.runtime.leave().catch(() => undefined)));
  clients.forEach((each) => each.runtime.disconnect());
});

describe('collaboration against the relay', { timeout: 20000 }, () => {
  it('syncs the owner scene to a joiner', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await roomOpen('Snapshot');
    const joiner = await joinSynced(room, 'Joiner');
    expect(joiner.find('Seed')).toBeDefined();
    await converged([owner, joiner]);
  });
});
