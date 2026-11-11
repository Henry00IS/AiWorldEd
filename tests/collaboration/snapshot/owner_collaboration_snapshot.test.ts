import { describe, expect, it } from 'vitest';
import {
  SNAPSHOT_COLLABORATION_LARGE_INTERVAL_MS,
  SNAPSHOT_COLLABORATION_PERIOD_MS,
  SnapshotCollaborationOwner,
} from '@/collaboration/snapshot/owner_collaboration_snapshot.js';
import { snapshotCollaborationParse } from '@/collaboration/snapshot/store_collaboration_snapshot.js';
import { projectHistoryStoreMemory } from '@/project/history/store/project_history_trees.js';

/**
 * Builds a room history keeper over a fake room of a number of objects.
 *
 * @param count Object count.
 * @param states Agreed states the fake replica reports.
 * @returns Keeper, room tree, fake replica, clock and status lines.
 */
function ownerCreate(count: number, states: unknown[] = []) {
  const baselines = new Map(Array.from({ length: count }, (_, index) => [`n${index}`, {}]));
  const replica = { revision: 0, baselines, snapshotStates: () => states };
  const sync = { replica, isSynced: () => true, commit: () => null };
  const clock = { now: 0 };
  const statuses: string[] = [];
  const host = { status: (text: string) => statuses.push(text), refresh: () => undefined };
  const store = projectHistoryStoreMemory('Castle Jam');
  const history = async () => ({ store, fileSystem: null, library: null });
  const owner = new SnapshotCollaborationOwner(sync as never, host as never, history, 'Castle Jam', () => clock.now);
  return { owner, store, replica, clock, statuses };
}

/**
 * Lets pending saves finish.
 *
 * @returns Resolves after a macrotask.
 */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('SnapshotCollaborationOwner', () => {
  it('saves periodically into one editing session, only after the scene changed', async () => {
    const { owner, store, replica, clock } = ownerCreate(4);
    clock.now = SNAPSHOT_COLLABORATION_PERIOD_MS;
    owner.poll();
    await settle();
    expect((await store.index()).nodes.map((node) => node.autosaves)).toEqual([1]);
    clock.now += SNAPSHOT_COLLABORATION_PERIOD_MS;
    owner.poll();
    await settle();
    expect((await store.index()).nodes.map((node) => node.autosaves)).toEqual([1]);
    replica.revision += 1;
    clock.now += SNAPSHOT_COLLABORATION_PERIOD_MS - 1;
    owner.poll();
    clock.now += 1;
    owner.poll();
    await settle();
    expect((await store.index()).nodes.map((node) => node.autosaves)).toEqual([2]);
  });

  it('saves before large relayed deletions, rate limited, and keeps that state apart', async () => {
    const { owner, store, clock, replica } = ownerCreate(100);
    owner.beforeRemote([{ k: 'delete', ids: ['n1', 'n2'] }]);
    owner.beforeRemote([{ k: 'delete', ids: Array.from({ length: 20 }, (_, index) => `n${index}`) }]);
    owner.beforeRemote([{ k: 'delete', ids: Array.from({ length: 30 }, (_, index) => `n${index}`) }]);
    await settle();
    expect((await store.index()).nodes).toHaveLength(1);
    expect((await store.index()).live).toBeNull();
    clock.now = SNAPSHOT_COLLABORATION_LARGE_INTERVAL_MS;
    replica.revision += 1;
    owner.beforeRemote([{ k: 'delete', ids: Array.from({ length: 25 }, (_, index) => `n${index}`) }]);
    await settle();
    expect((await store.index()).nodes).toHaveLength(2);
  });

  it('counts a quarter of a small scene as large', async () => {
    const { owner, store } = ownerCreate(8);
    owner.beforeRemote([{ k: 'delete', ids: ['n1', 'n2'] }]);
    await settle();
    expect((await store.index()).nodes).toHaveLength(1);
  });

  it('starts a new session when the room starts', async () => {
    const { owner, store } = ownerCreate(1);
    await owner.take('periodic');
    await owner.take('room-start');
    const index = await store.index();
    expect(index.nodes).toHaveLength(2);
    expect(index.nodes[1]?.parent).toBe(index.nodes[0]?.id);
  });

  it('reports a missing saved state', async () => {
    const { owner } = ownerCreate(1);
    const report = await owner.restore('20261101-000000-000');
    expect(report).toMatchObject({ ok: false, message: 'Saved state not found or unreadable' });
  });

  it('copies live states that hold values the browser cannot clone', async () => {
    const live = { id: 'n0', kind: 'entry', parent: '', key: 'a', data: { name: 'Crate', hook: () => undefined } };
    const { owner, store } = ownerCreate(1, [live]);
    const node = await owner.take('periodic');
    live.data.name = 'Changed';
    const text = await (await store.stateRead(node?.id ?? ''))?.text();
    expect(snapshotCollaborationParse(text ?? '')).toEqual([
      { id: 'n0', kind: 'entry', parent: '', key: 'a', data: { name: 'Crate' } },
    ]);
    expect(JSON.parse(text ?? '{}').room).toBe('Castle Jam');
  });

  it('names snapshots taken by hand so cleanup keeps them; automatic saves stay unnamed', async () => {
    const { owner } = ownerCreate(1, [{ id: 'n0', kind: 'entry', parent: '', key: 'a', data: {} }]);
    expect((await owner.snapshot('Before Boss Room'))?.name).toBe('Before Boss Room');
    expect((await owner.take('periodic'))?.name).toBe('');
  });

  it('tells whether the room changed since it was last saved', async () => {
    const { owner, replica } = ownerCreate(1);
    expect(owner.pending()).toBe(true);
    await owner.take('periodic');
    expect(owner.pending()).toBe(false);
    replica.revision += 1;
    expect(owner.pending()).toBe(true);
  });
});
