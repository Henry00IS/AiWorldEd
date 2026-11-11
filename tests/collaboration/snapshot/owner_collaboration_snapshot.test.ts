import { describe, expect, it } from 'vitest';
import {
  SNAPSHOT_COLLABORATION_LARGE_INTERVAL_MS,
  SNAPSHOT_COLLABORATION_PERIOD_MS,
  SnapshotCollaborationOwner,
} from '@/collaboration/snapshot/owner_collaboration_snapshot.js';
import { snapshotCollaborationParse } from '@/collaboration/snapshot/store_collaboration_snapshot.js';
import { PROJECT_HISTORY_SNAPSHOT_EVERY_MS } from '@/project/history/core/project_history_entry.js';
import { projectHistoryStoreMemory } from '@/project/history/core/project_history_store.js';

/**
 * Builds a room history keeper over a fake room of a number of objects.
 *
 * @param count Object count.
 * @param states Agreed states the fake replica reports.
 * @returns Keeper, store, fake replica, clock and status lines.
 */
function ownerCreate(count: number, states: unknown[] = []) {
  const baselines = new Map(Array.from({ length: count }, (_, index) => [`n${index}`, {}]));
  const replica = { revision: 0, baselines, snapshotStates: () => states };
  const sync = { replica, isSynced: () => true, commit: () => null };
  const clock = { now: 0 };
  const statuses: string[] = [];
  const host = { status: (text: string) => statuses.push(text), refresh: () => undefined };
  const store = projectHistoryStoreMemory();
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

/**
 * Lists the kinds of the room's saves, oldest first.
 *
 * @param store Store.
 * @returns Kinds.
 */
async function kinds(store: ReturnType<typeof projectHistoryStoreMemory>): Promise<string[]> {
  return (await store.entries()).sort((a, b) => a.time - b.time).map((entry) => entry.kind);
}

describe('SnapshotCollaborationOwner', () => {
  it('saves periodically, only after the scene changed', async () => {
    const { owner, store, replica, clock } = ownerCreate(4);
    clock.now = SNAPSHOT_COLLABORATION_PERIOD_MS;
    owner.poll();
    await settle();
    expect(await kinds(store)).toEqual(['autosave']);
    clock.now += SNAPSHOT_COLLABORATION_PERIOD_MS;
    owner.poll();
    await settle();
    expect(await kinds(store)).toEqual(['autosave']);
    replica.revision += 1;
    clock.now += SNAPSHOT_COLLABORATION_PERIOD_MS - 1;
    owner.poll();
    clock.now += 1;
    owner.poll();
    await settle();
    expect(await kinds(store)).toEqual(['autosave', 'autosave']);
  });

  it('makes a snapshot once the room is joined, then every 30 minutes the room changed', async () => {
    const { owner, store, replica, clock } = ownerCreate(1);
    expect((await owner.take('joined'))?.kind).toBe('snapshot');
    clock.now = PROJECT_HISTORY_SNAPSHOT_EVERY_MS - 1;
    replica.revision += 1;
    await owner.take('periodic');
    clock.now += 1;
    replica.revision += 1;
    await owner.take('large-change');
    expect(await kinds(store)).toEqual(['snapshot', 'autosave', 'snapshot']);
    expect((await store.entries()).every((entry) => entry.source === 'room' && entry.room === 'Castle Jam')).toBe(true);
  });

  it('makes a snapshot on every manual save, however soon after the last one', async () => {
    const { owner, store, clock, replica } = ownerCreate(1);
    await owner.take('joined');
    clock.now += 1;
    replica.revision += 1;
    expect((await owner.take('saved'))?.kind).toBe('snapshot');
    clock.now += 1;
    expect((await owner.take('saved'))?.kind).toBe('snapshot');
    expect(await kinds(store)).toEqual(['snapshot', 'snapshot', 'snapshot']);
  });

  it('saves before large relayed deletions, rate limited', async () => {
    const { owner, store, clock, replica } = ownerCreate(100);
    owner.beforeRemote([{ k: 'delete', ids: ['n1', 'n2'] }]);
    owner.beforeRemote([{ k: 'delete', ids: Array.from({ length: 20 }, (_, index) => `n${index}`) }]);
    owner.beforeRemote([{ k: 'delete', ids: Array.from({ length: 30 }, (_, index) => `n${index}`) }]);
    await settle();
    expect(await store.entries()).toHaveLength(1);
    clock.now = SNAPSHOT_COLLABORATION_LARGE_INTERVAL_MS;
    replica.revision += 1;
    owner.beforeRemote([{ k: 'delete', ids: Array.from({ length: 25 }, (_, index) => `n${index}`) }]);
    await settle();
    expect(await store.entries()).toHaveLength(2);
  });

  it('counts a quarter of a small scene as large', async () => {
    const { owner, store } = ownerCreate(8);
    owner.beforeRemote([{ k: 'delete', ids: ['n1', 'n2'] }]);
    await settle();
    expect(await store.entries()).toHaveLength(1);
  });

  it('reports a missing saved state', async () => {
    const { owner } = ownerCreate(1);
    const report = await owner.restore('20261101-000000-000');
    expect(report).toMatchObject({ ok: false, message: 'Saved state not found or unreadable' });
  });

  it('copies live states that hold values the browser cannot clone', async () => {
    const live = { id: 'n0', kind: 'entry', parent: '', key: 'a', data: { name: 'Crate', hook: () => undefined } };
    const { owner, store } = ownerCreate(1, [live]);
    const entry = await owner.take('periodic');
    live.data.name = 'Changed';
    const text = await (await store.stateRead(entry!))?.text();
    expect(snapshotCollaborationParse(text ?? '')).toEqual([
      { id: 'n0', kind: 'entry', parent: '', key: 'a', data: { name: 'Crate' } },
    ]);
    expect(JSON.parse(text ?? '{}').room).toBe('Castle Jam');
    expect(entry?.objectCount).toBe(1);
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
