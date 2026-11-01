import { describe, expect, it } from 'vitest';
import { codecStateText } from '@/collaboration/scene/node_collaboration_codec.js';
import type {
  NodeCollaborationBaseline,
  NodeCollaborationState,
} from '@/collaboration/scene/node_collaboration_types.js';
import { LockCollaborationTable } from '@/collaboration/sync/lock_collaboration_table.js';
import { planCollaborationRestore } from '@/collaboration/snapshot/plan_collaboration_restore.js';

/**
 * Builds a node state.
 *
 * @param id Id.
 * @param parent Parent id.
 * @param name Name stored in the payload.
 * @returns State.
 */
function state(id: string, parent = '', name = id): NodeCollaborationState {
  return { id, kind: 'entry', parent, key: 'a', data: { entry: { name } } as never };
}

/**
 * Builds an agreed scene with the local user 1.
 *
 * @param states Agreed states.
 * @returns Baselines and locks.
 */
function scene(states: NodeCollaborationState[]) {
  const baselines = new Map<string, NodeCollaborationBaseline>();
  states.forEach((item) => baselines.set(item.id, { state: item, text: codecStateText(item), fingerprint: '' }));
  const locks = new LockCollaborationTable();
  locks.selfSet(1);
  return { baselines, locks };
}

describe('planCollaborationRestore', () => {
  it('recreates deleted, reverts changed and deletes added objects', () => {
    const room = scene([state('a', '', 'moved'), state('c')]);
    const plan = planCollaborationRestore(room, [state('a'), state('b')]);
    const byId = new Map(plan.changes.map((change) => [change.id, change]));
    expect(byId.get('a')?.after).toEqual(state('a'));
    expect(byId.get('b')?.before).toBeNull();
    expect(byId.get('c')?.after).toBeNull();
    expect(plan.skipped).toEqual([]);
  });

  it('leaves unchanged objects out', () => {
    expect(planCollaborationRestore(scene([state('a')]), [state('a')]).changes).toEqual([]);
  });

  it('skips objects another member holds and keeps their parents', () => {
    const room = scene([state('g'), state('x', 'g', 'changed')]);
    room.locks.apply(2, ['x'], []);
    const plan = planCollaborationRestore(room, []);
    expect(plan.changes).toEqual([]);
    expect(plan.skipped.map((skip) => [skip.id, skip.reason, skip.holder])).toEqual([
      ['x', 'locked', 2],
      ['g', 'dependent', -1],
    ]);
  });

  it('skips objects inside a container another member holds', () => {
    const room = scene([state('g'), state('x', 'g', 'changed')]);
    room.locks.apply(3, ['g'], []);
    const plan = planCollaborationRestore(room, [state('g'), state('x', 'g')]);
    expect(plan.skipped).toEqual([{ id: 'x', reason: 'container-locked', holder: 3 }]);
  });

  it('skips creates under a parent that stays deleted and refused ids', () => {
    const room = scene([state('k')]);
    room.locks.apply(2, ['p'], []);
    const plan = planCollaborationRestore(room, [state('p'), state('q', 'p'), state('k', '', 'old')], new Set(['k']));
    expect(plan.changes).toEqual([]);
    expect(new Map(plan.skipped.map((skip) => [skip.id, skip.reason]))).toEqual(
      new Map([
        ['p', 'locked'],
        ['q', 'container-locked'],
        ['k', 'busy'],
      ]),
    );
  });

  it('allows objects the local user holds', () => {
    const room = scene([state('a', '', 'changed')]);
    room.locks.apply(1, ['a'], []);
    expect(planCollaborationRestore(room, [state('a')]).changes).toHaveLength(1);
  });
});
