import { describe, expect, it } from 'vitest';
import {
  SNAPSHOT_COLLABORATION_LARGE_INTERVAL_MS,
  SNAPSHOT_COLLABORATION_PERIOD_MS,
  SnapshotCollaborationOwner,
} from '@/collaboration/snapshot/owner_collaboration_snapshot.js';
import { SnapshotCollaborationMemoryStore } from '@/collaboration/snapshot/store_collaboration_snapshot.js';

/**
 * Builds a snapshot keeper over a fake room of a number of objects.
 *
 * @param count Object count.
 * @returns Keeper, store, fake replica and clock.
 */
function ownerCreate(count: number) {
  const baselines = new Map(Array.from({ length: count }, (_, index) => [`n${index}`, {}]));
  const replica = { revision: 0, baselines, snapshotStates: () => [] };
  const sync = { replica, isSynced: () => true, commit: () => null };
  const clock = { now: 0 };
  const statuses: string[] = [];
  const host = { status: (text: string) => statuses.push(text), refresh: () => undefined };
  const store = new SnapshotCollaborationMemoryStore();
  const owner = new SnapshotCollaborationOwner(
    sync as never,
    {} as never,
    host as never,
    () => [store],
    () => clock.now,
  );
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
  it('takes periodic snapshots only after the scene changed', async () => {
    const { owner, store, replica, clock } = ownerCreate(4);
    clock.now = SNAPSHOT_COLLABORATION_PERIOD_MS;
    owner.poll();
    await settle();
    expect(await store.list()).toHaveLength(1);
    clock.now += SNAPSHOT_COLLABORATION_PERIOD_MS;
    owner.poll();
    await settle();
    expect(await store.list()).toHaveLength(1);
    replica.revision += 1;
    clock.now += SNAPSHOT_COLLABORATION_PERIOD_MS - 1;
    owner.poll();
    clock.now += 1;
    owner.poll();
    await settle();
    expect((await store.list()).map((meta) => meta.reason)).toEqual(['periodic', 'periodic']);
  });

  it('takes a snapshot before large relayed deletions, rate limited', async () => {
    const { owner, store, clock } = ownerCreate(100);
    owner.beforeRemote([{ k: 'delete', ids: ['n1', 'n2'] }]);
    owner.beforeRemote([{ k: 'delete', ids: Array.from({ length: 20 }, (_, index) => `n${index}`) }]);
    owner.beforeRemote([{ k: 'delete', ids: Array.from({ length: 30 }, (_, index) => `n${index}`) }]);
    await settle();
    expect((await store.list()).map((meta) => meta.reason)).toEqual(['large-change']);
    clock.now = SNAPSHOT_COLLABORATION_LARGE_INTERVAL_MS;
    owner.beforeRemote([{ k: 'delete', ids: Array.from({ length: 25 }, (_, index) => `n${index}`) }]);
    await settle();
    expect(await store.list()).toHaveLength(2);
  });

  it('counts a quarter of a small scene as large', async () => {
    const { owner, store } = ownerCreate(8);
    owner.beforeRemote([{ k: 'delete', ids: ['n1', 'n2'] }]);
    await settle();
    expect(await store.list()).toHaveLength(1);
  });

  it('reports a missing snapshot', async () => {
    const { owner, statuses } = ownerCreate(1);
    const report = await owner.restore('20261101-000000-000_1_manual');
    expect(report.ok).toBe(false);
    expect(statuses).toEqual(['Snapshot not found or unreadable']);
  });
});
