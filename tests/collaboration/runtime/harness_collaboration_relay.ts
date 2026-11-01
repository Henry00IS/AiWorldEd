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
export function harnessRelayRoom(
  name: string,
  seed: string = 'Seed',
): Promise<{ owner: HarnessCollaborationEditor; room: string }> {
  return harnessRelayRoomBuilt(name, (owner) => void owner.boxAdd(seed));
}

/**
 * Creates a public room owned by a new client whose scene is built first.
 *
 * @param name Room name, also the owner name prefix.
 * @param build Fills the owner scene before the room is created.
 * @returns Owner client and room id.
 */
export async function harnessRelayRoomBuilt(
  name: string,
  build: (owner: HarnessCollaborationEditor) => void,
): Promise<{ owner: HarnessCollaborationEditor; room: string }> {
  const owner = harnessRelayClient(`${name} owner`);
  build(owner);
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
  await harnessRelayLiveConverged(list);
}

/**
 * Waits until every client's live scene equals its agreed state and the live
 * scenes of all clients match, then reports the first difference on timeout.
 *
 * @param list Clients.
 */
export async function harnessRelayLiveConverged(list: readonly HarnessCollaborationEditor[]): Promise<void> {
  const settled = (): boolean => harnessRelayLiveMismatch(list) === null;
  try {
    await harnessCollaborationUntil(settled, 5000, 'live convergence');
  } catch {
    throw new Error(`live scenes diverged: ${harnessRelayLiveMismatch(list) ?? 'recovered'}`);
  }
}

/**
 * Describes the first live scene mismatch.
 *
 * @param list Clients.
 * @returns Description, or null when every live scene agrees.
 */
export function harnessRelayLiveMismatch(list: readonly HarnessCollaborationEditor[]): string | null {
  const texts = list.map((client) => client.sceneChecksumText());
  for (const [index, client] of list.entries()) {
    const live = texts[index] ?? '';
    const agreed = client.agreedChecksumText();
    if (live !== agreed) return `client ${index} live vs agreed: ${harnessRelayFirstDifference(live, agreed)}`;
    if (live !== texts[0]) return `client ${index} vs client 0: ${harnessRelayFirstDifference(live, texts[0] ?? '')}`;
  }
  return null;
}

/**
 * Returns the first differing line of two texts, shortened.
 *
 * @param left Text.
 * @param right Text.
 * @returns Both lines around the first difference.
 */
function harnessRelayFirstDifference(left: string, right: string): string {
  let at = 0;
  while (at < left.length && left[at] === right[at]) at++;
  const start = Math.max(0, left.lastIndexOf('{"id"', at));
  const around = (text: string): string => text.slice(Math.max(start, at - 160), at + 240);
  return `${left.slice(start, start + 60)} @${at - start}: ${around(left)} <> ${around(right)}`;
}

/** Leaves and disconnects every client of the finished test. */
export async function harnessRelayClose(): Promise<void> {
  const list = HARNESS_RELAY_CLIENTS.splice(0);
  await Promise.all(list.map((each) => each.runtime.leave().catch(() => undefined)));
  list.forEach((each) => each.runtime.disconnect());
}
