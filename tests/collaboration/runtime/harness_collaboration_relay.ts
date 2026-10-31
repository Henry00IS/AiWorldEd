import { HarnessCollaborationEditor, harnessCollaborationUntil } from './harness_collaboration_editor.js';

/** Clients opened by the current test, closed by {@link harnessRelayClose}. */
const HARNESS_RELAY_CLIENTS: HarnessCollaborationEditor[] = [];

/** Whether the relay must be reachable (`bun run test:collab`). */
export const HARNESS_RELAY_REQUIRED = process.env['AIWORLDED_COLLAB_REQUIRED'] === '1';

/**
 * Creates a tracked client.
 *
 * @param name Display name.
 * @returns Client.
 */
export function harnessRelayClient(name: string): HarnessCollaborationEditor {
  const created = new HarnessCollaborationEditor(name);
  HARNESS_RELAY_CLIENTS.push(created);
  return created;
}

/**
 * Creates a public room owned by a new client whose scene holds one box.
 *
 * @param name Room name, also the owner name prefix.
 * @param seed Name of the box in the room scene.
 * @returns Owner client and room id.
 */
export async function harnessRelayRoom(
  name: string,
  seed: string = 'Seed',
): Promise<{ owner: HarnessCollaborationEditor; room: string }> {
  const owner = harnessRelayClient(`${name} owner`);
  owner.boxAdd(seed);
  await owner.runtime.create(name, false, '');
  return { owner, room: owner.runtime.room?.id ?? '' };
}

/**
 * Joins a room with a new client and waits until it is synchronized.
 *
 * @param room Room id.
 * @param name Display name.
 * @returns Client.
 */
export async function harnessRelayJoin(room: string, name: string): Promise<HarnessCollaborationEditor> {
  const joiner = harnessRelayClient(name);
  await joiner.runtime.join(room, '');
  await harnessCollaborationUntil(() => joiner.runtime.state === 'room', 5000, `${name} synced`);
  return joiner;
}

/**
 * Waits until every client shows the same scene.
 *
 * @param list Clients.
 */
export async function harnessRelayConverged(list: readonly HarnessCollaborationEditor[]): Promise<void> {
  const [first] = list;
  if (first === undefined) return;
  const same = (): boolean => list.every((other) => other.fingerprint() === first.fingerprint());
  await harnessCollaborationUntil(same, 5000, 'convergence');
}

/** Leaves and disconnects every client of the finished test. */
export async function harnessRelayClose(): Promise<void> {
  const list = HARNESS_RELAY_CLIENTS.splice(0);
  await Promise.all(list.map((each) => each.runtime.leave().catch(() => undefined)));
  list.forEach((each) => each.runtime.disconnect());
}
