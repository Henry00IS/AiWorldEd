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

let relayUp = false;

beforeAll(async () => {
  relayUp = await harnessCollaborationRelayUp();
  if (!relayUp && HARNESS_RELAY_REQUIRED) throw new Error('collaboration relay is not reachable');
});

afterEach(harnessRelayClose);

/**
 * Builds Group A holding Cube, a loose Crate and Seed, and a solid model.
 *
 * @param owner Owner client.
 */
function sceneBuild(owner: HarnessCollaborationEditor): void {
  owner.boxAdd('Cube', owner.groupAdd('Group A'));
  owner.boxAdd('Crate').position.set(4, 0, 0);
  owner.boxAdd('Seed');
  owner.solidAdd('Solid');
}

/**
 * Creates the room and joins Alice and Bob.
 *
 * @param name Room name.
 * @returns Owner, Alice and Bob.
 */
async function roomOfThree(name: string): Promise<HarnessCollaborationEditor[]> {
  const { owner, room } = await harnessRelayRoomBuilt(name, sceneBuild);
  const alice = await harnessRelayJoin(room, 'Alice');
  const bob = await harnessRelayJoin(room, 'Bob');
  return [owner, alice, bob];
}

/**
 * Waits until every client sees the same holder of an object.
 *
 * @param clients Clients.
 * @param name Object name.
 */
async function holderAgreed(clients: readonly HarnessCollaborationEditor[], name: string): Promise<void> {
  await harnessCollaborationUntil(
    () =>
      clients.every((client) => client.holderOf(name) !== null && client.holderOf(name) === clients[0]!.holderOf(name)),
    5000,
    `holder of ${name} agreed`,
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
 * Reads the first brush id of a client's solid model.
 *
 * @param client Client.
 * @returns Brush id.
 */
function brushId(client: HarnessCollaborationEditor): string {
  const brush = client.solid('Solid').getBrushes()[0];
  if (brush === undefined) throw new Error('missing brush');
  return brush.id;
}

/**
 * Integration tests for the barrier-free rules (Rule 9): selection never locks,
 * edits take a short lease, one-shot edits are field-level last-writer-wins in
 * relay order, ops follow ids, deletes drop late ops with a notice and a frozen
 * lease expires and reverts.
 */
describe('barrier-free collaboration convergence', { timeout: 30000 }, () => {
  it('lets every member select the same object without a lease', async ({ skip }) => {
    if (!relayUp) skip();
    const [owner, alice, bob] = await roomOfThree('Same selection');
    expect(owner!.selectTry('Seed')).toBe(true);
    expect(alice!.selectTry('Seed')).toBe(true);
    expect(bob!.selectTry('Seed')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect([owner, alice, bob].map((client) => client!.holderOf('Seed'))).toEqual([null, null, null]);
    await harnessRelayConverged([owner!, alice!, bob!]);
  });

  it('converges concurrent one-shot edits of different fields and of the same field', async ({ skip }) => {
    if (!relayUp) skip();
    const [owner, alice, bob] = await roomOfThree('Field edits');
    alice!.object('Seed').name = 'Renamed';
    bob!.object('Crate').visible = false;
    alice!.commit();
    bob!.commit();
    await harnessCollaborationUntil(
      () => owner!.find('Renamed') !== undefined && owner!.object('Crate').visible === false,
      5000,
      'both fields applied',
    );
    alice!.object('Crate').name = 'By Alice';
    bob!.object('Crate').name = 'By Bob';
    alice!.commit();
    bob!.commit();
    await harnessRelayConverged([owner!, alice!, bob!]);
    const names = [owner, alice, bob].map((client) => (client!.find('By Alice') ? 'By Alice' : 'By Bob'));
    expect(new Set(names).size).toBe(1);
    expect(owner!.object(names[0]!).visible).toBe(false);
    expect(owner!.find('Renamed')).toBeDefined();
  });

  it('refuses a one-shot edit while another member drags, then accepts it after the commit', async ({ skip }) => {
    if (!relayUp) skip();
    const [owner, alice, bob] = await roomOfThree('Drag vs one-shot');
    await bob!.select('Seed');
    bob!.object('Seed').position.x = 5;
    await holderAgreed([owner!, alice!, bob!], 'Seed');
    await harnessCollaborationUntil(() => alice!.object('Seed').position.x === 5, 5000, 'live preview seen');
    alice!.object('Seed').name = 'Too early';
    alice!.commit();
    await harnessCollaborationUntil(() => alice!.find('Seed') !== undefined, 5000, 'one-shot reverted');
    expect(alice!.statuses.some((status) => status.includes('Bob'))).toBe(true);
    bob!.commit();
    await bob!.editEnd();
    await harnessCollaborationUntil(() => alice!.holderOf('Seed') === null, 5000, 'lease released');
    alice!.object('Seed').name = 'After';
    alice!.commit();
    await harnessCollaborationUntil(() => owner!.find('After') !== undefined, 5000, 'one-shot applied');
    await harnessRelayConverged([owner!, alice!, bob!]);
    expect(owner!.object('After').position.x).toBe(5);
  });

  it('refuses a drag of an object another member drags at once, without sending it', async ({ skip }) => {
    if (!relayUp) skip();
    const [owner, alice, bob] = await roomOfThree('Drag vs drag');
    await bob!.select('Seed');
    pointerHold(bob!, true);
    bob!.object('Seed').position.x = 5;
    await holderAgreed([owner!, alice!, bob!], 'Seed');
    await harnessCollaborationUntil(() => alice!.object('Seed').position.x === 5, 5000, 'live preview seen');
    expect(alice!.selectTry('Seed')).toBe(true);
    await Promise.resolve();
    pointerHold(alice!, true);
    alice!.object('Seed').position.y = 3;
    await harnessCollaborationUntil(
      () => alice!.statuses.some((status) => status.includes('Bob is editing it')),
      3000,
      'drag refused at once',
    );
    pointerHold(alice!, false);
    expect(owner!.object('Seed').position.y).toBe(0);
    pointerHold(bob!, false);
    bob!.commit();
    await bob!.editEnd();
    await harnessRelayConverged([owner!, alice!, bob!]);
    expect(owner!.object('Seed').position.toArray()).toEqual([5, 0, 0]);
  });

  it('holds the lease for a whole geometry-reading tool, then releases it when the tool ends', async ({ skip }) => {
    if (!relayUp) skip();
    const [owner, alice, bob] = await roomOfThree('Tool lease');
    expect(bob!.selectTry('Crate')).toBe(true);
    bob!.operationRunning = true;
    await holderAgreed([owner!, alice!, bob!], 'Crate');
    await new Promise((resolve) => setTimeout(resolve, 6500));
    expect(alice!.holderOf('Crate')).not.toBeNull();
    alice!.object('Crate').name = 'Mid tool';
    alice!.commit();
    await harnessCollaborationUntil(() => alice!.find('Crate') !== undefined, 5000, 'one-shot reverted');
    expect(alice!.statuses.some((status) => status.includes('Bob'))).toBe(true);
    bob!.operationRunning = false;
    await harnessCollaborationUntil(() => alice!.holderOf('Crate') === null, 5000, 'lease released');
    alice!.object('Crate').name = 'After tool';
    alice!.commit();
    await harnessRelayConverged([owner!, alice!, bob!]);
    expect(owner!.find('After tool')).toBeDefined();
  });

  it('follows ids through a reparent: an edit of a moved object lands on it', async ({ skip }) => {
    if (!relayUp) skip();
    const [owner, alice, bob] = await roomOfThree('Reparent vs edit');
    bob!.object('Group A').add(bob!.object('Crate'));
    alice!.object('Crate').name = 'Labelled';
    bob!.commit();
    alice!.commit();
    await harnessRelayConverged([owner!, alice!, bob!]);
    for (const client of [owner, alice, bob]) {
      expect(client!.object('Labelled').parent?.name).toBe('Group A');
    }
  });

  it('refuses a reparent of an object another member edits', async ({ skip }) => {
    if (!relayUp) skip();
    const [owner, alice, bob] = await roomOfThree('Reparent held');
    await alice!.editStart('Crate');
    await holderAgreed([owner!, alice!, bob!], 'Crate');
    const moved = await bob!.outlinerMove(['Crate'], 'Group A', () => bob!.object('Group A').add(bob!.object('Crate')));
    expect(moved).toBe(false);
    await alice!.editEnd();
    await harnessRelayConverged([owner!, alice!, bob!]);
    expect(owner!.object('Crate').parent?.name).not.toBe('Group A');
  });

  it('drops an edit of an object another member deleted, with a notice', async ({ skip }) => {
    if (!relayUp) skip();
    const [owner, alice, bob] = await roomOfThree('Delete vs edit');
    const crate = bob!.object('Crate');
    crate.parent?.remove(crate);
    bob!.commit();
    alice!.object('Crate').name = 'Ghost';
    alice!.commit();
    await harnessRelayConverged([owner!, alice!, bob!]);
    for (const client of [owner, alice, bob]) {
      expect(client!.find('Crate')).toBeUndefined();
      expect(client!.find('Ghost')).toBeUndefined();
    }
  });

  it('refuses a delete of an object another member edits', async ({ skip }) => {
    if (!relayUp) skip();
    const [owner, alice, bob] = await roomOfThree('Delete held');
    await alice!.editStart('Crate');
    await holderAgreed([owner!, alice!, bob!], 'Crate');
    const crate = bob!.object('Crate');
    crate.parent?.remove(crate);
    bob!.commit();
    await harnessCollaborationUntil(() => bob!.find('Crate') !== undefined, 5000, 'delete reverted');
    await alice!.editEnd();
    await harnessRelayConverged([owner!, alice!, bob!]);
    expect(owner!.find('Crate')).toBeDefined();
  });

  it('expires a frozen lease and reverts its uncommitted preview for everyone', async ({ skip }) => {
    if (!relayUp) skip();
    const [owner, alice, bob] = await roomOfThree('Freeze');
    const sync = bob!.runtime.session!.sync as unknown as Record<'commit' | 'leaseIdle', () => unknown> & {
      lease: { renew: () => boolean };
    };
    const thawed = { commit: sync.commit, leaseIdle: sync.leaseIdle, renew: sync.lease.renew };
    sync.commit = () => null;
    sync.leaseIdle = () => undefined;
    await bob!.select('Seed');
    bob!.object('Seed').position.x = 6;
    await harnessCollaborationUntil(() => owner!.object('Seed').position.x === 6, 5000, 'live preview seen');
    sync.lease.renew = () => false;
    const frozenAt = Date.now();
    await harnessCollaborationUntil(() => owner!.holderOf('Seed') === null, 12000, 'lease expired');
    expect(Date.now() - frozenAt).toBeLessThan(9000);
    await harnessCollaborationUntil(
      () => owner!.object('Seed').position.x === 0 && alice!.object('Seed').position.x === 0,
      5000,
      'preview reverted',
    );
    Object.assign(sync, { commit: thawed.commit, leaseIdle: thawed.leaseIdle });
    sync.lease.renew = thawed.renew;
    await harnessCollaborationUntil(() => bob!.object('Seed').position.x === 0, 5000, 'holder reverted');
    await harnessRelayConverged([owner!, alice!, bob!]);
    await alice!.editStart('Seed');
  });

  it('keeps a solid model selected while another member edits a brush inside it', async ({ skip }) => {
    if (!relayUp) skip();
    const [owner, alice, bob] = await roomOfThree('Solid and brush');
    expect(alice!.selectTry('Solid')).toBe(true);
    const outcome = await bob!.runtime.session!.sync.operationHold([brushId(bob!)]);
    expect(outcome.ok).toBe(true);
    await harnessCollaborationUntil(
      () => alice!.runtime.session!.sync.replica.locks.heldByOther(brushId(alice!)),
      5000,
      'brush lease seen',
    );
    expect(await alice!.editTry('Solid')).toBe(false);
    expect(alice!.statuses.at(-1)).toContain('Bob');
    expect(alice!.selection.getInspectorObjects().map((object) => object.name)).toContain('Solid');
    await bob!.editEnd();
    await harnessCollaborationUntil(
      () => !alice!.runtime.session!.sync.replica.locks.heldByOther(brushId(alice!)),
      5000,
      'brush released',
    );
    await alice!.editStart('Solid');
    await harnessRelayConverged([owner!, alice!, bob!]);
  });

  it('runs an AI tool on one brush while a user drags another, and refuses it on the dragged one', async ({ skip }) => {
    if (!relayUp) skip();
    const [owner, alice, bob] = await roomOfThree('MCP and user');
    const dragged = brushId(bob!);
    const other = bob!.solid('Solid').getBrushes()[1]!.id;
    expect((await bob!.runtime.session!.sync.operationHold([dragged])).ok).toBe(true);
    await harnessCollaborationUntil(
      () => alice!.runtime.session!.sync.replica.locks.heldByOther(dragged),
      5000,
      'brush lease seen',
    );
    const held = await alice!.tool('rename_brush', { brushId: dragged, name: 'Nope' });
    expect(held).toMatchObject({ ok: false, error: 'locked', holder: 'Bob' });
    const free = await alice!.tool('rename_brush', { brushId: other, name: 'By AI' });
    expect(free.ok).toBe(true);
    await bob!.editEnd();
    await harnessRelayConverged([owner!, alice!, bob!]);
    expect(owner!.solid('Solid').findBrush(other)?.mesh?.name).toBe('By AI');
    expect(owner!.solid('Solid').findBrush(dragged)?.mesh?.name).not.toBe('Nope');
  });
});
