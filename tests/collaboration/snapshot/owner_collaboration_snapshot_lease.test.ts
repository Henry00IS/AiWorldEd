import { describe, expect, it, vi } from 'vitest';
import { codecStateText } from '@/collaboration/scene/node_collaboration_codec.js';
import type {
  NodeCollaborationBaseline,
  NodeCollaborationState,
} from '@/collaboration/scene/node_collaboration_types.js';
import { LockCollaborationTable } from '@/collaboration/sync/lock_collaboration_table.js';
import type { LeaseCollaborationOutcome } from '@/collaboration/sync/lease_collaboration_client.js';
import { SnapshotCollaborationOwner } from '@/collaboration/snapshot/owner_collaboration_snapshot.js';
import { SnapshotCollaborationMemoryStore } from '@/collaboration/snapshot/store_collaboration_snapshot.js';

vi.mock('@/collaboration/sync/history_collaboration_apply.js', () => ({
  historyCollaborationApply: () => ({ ops: [] }),
}));

/**
 * Builds a node state.
 *
 * @param id Id.
 * @param name Name stored in the payload.
 * @returns State.
 */
function state(id: string, name = id): NodeCollaborationState {
  return { id, kind: 'entry', parent: '', key: 'a', data: { entry: { name } } as never };
}

/**
 * Builds a snapshot keeper whose agreed scene differs from a saved snapshot,
 * with a scripted relay answer for every lease request.
 *
 * @param agreed Agreed states of the room.
 * @param answers Lease answers, in request order.
 * @returns Keeper, the snapshot id, the lease requests and the release count.
 */
async function ownerCreate(agreed: NodeCollaborationState[], answers: LeaseCollaborationOutcome[]) {
  const baselines = new Map<string, NodeCollaborationBaseline>();
  agreed.forEach((item) => baselines.set(item.id, { state: item, text: codecStateText(item), fingerprint: '' }));
  const locks = new LockCollaborationTable();
  locks.selfSet(1);
  const replica = { revision: 0, baselines, locks, snapshotStates: () => [...agreed] };
  const requests: string[][] = [];
  const counters = { released: 0, recorded: 0 };
  const sync = {
    replica,
    isSynced: () => true,
    commit: () => null,
    operationHold: (ids: string[]) => {
      requests.push([...ids].sort());
      return Promise.resolve(answers.shift() ?? { ok: true, lease: 1, add: ids, remove: [] });
    },
    operationRelease: () => (counters.released += 1),
    operationsRecord: () => (counters.recorded += 1),
  };
  const host = { status: () => undefined, refresh: () => undefined };
  const store = new SnapshotCollaborationMemoryStore();
  const id = '20261101-000000-000_2_manual';
  await store.save({ id, savedAt: 0, count: 2, reason: 'manual', stored: 'memory', states: [state('a'), state('b')] });
  const owner = new SnapshotCollaborationOwner(sync as never, host as never, () => [store]);
  return { owner, id, requests, counters };
}

/** A restore leases the existing objects it changes, never by selection. */
describe('SnapshotCollaborationOwner restore leases', () => {
  it('leases the changed existing objects, applies, and releases the lease', async () => {
    const { owner, id, requests, counters } = await ownerCreate([state('a', 'moved'), state('c')], []);
    const report = await owner.restore(id);
    expect(report).toMatchObject({ ok: true, restored: 3, skipped: [] });
    expect(requests).toEqual([['a', 'c']]);
    expect(counters).toEqual({ released: 1, recorded: 1 });
  });

  it('skips the objects a refusal names and leases the rest', async () => {
    const refusal = { ok: false, lease: 1, code: 'lease_busy', conflicts: [{ id: 'c', by: 7 }], why: '' } as const;
    const { owner, id, requests, counters } = await ownerCreate([state('a', 'moved'), state('c')], [refusal]);
    const report = await owner.restore(id);
    expect(report.restored).toBe(2);
    expect(report.skipped).toEqual([{ id: 'c', reason: 'busy', holder: -1 }]);
    expect(requests).toEqual([['a', 'c'], ['a']]);
    expect(counters.released).toBe(1);
  });

  it('keeps every leased object when a refusal names none, and holds no lease', async () => {
    const refusal = { ok: false, lease: 1, code: 'timeout', conflicts: undefined, why: '' } as const;
    const { owner, id, requests, counters } = await ownerCreate([state('a', 'moved')], [refusal]);
    const report = await owner.restore(id);
    expect(report.skipped.map((skip) => skip.id)).toEqual(['a']);
    expect(report.restored).toBe(1);
    expect(requests).toEqual([['a']]);
    expect(counters.released).toBe(0);
  });
});
