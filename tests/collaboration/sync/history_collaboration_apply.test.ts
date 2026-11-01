import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import { SceneDeserializer } from '@/io/scene/scene_deserializer.js';
import type { NodeCollaborationState } from '@/collaboration/scene/node_collaboration_types.js';
import { ReplicaCollaborationScene } from '@/collaboration/sync/replica_collaboration_scene.js';
import {
  historyCollaborationApply,
  historyCollaborationCheck,
} from '@/collaboration/sync/history_collaboration_apply.js';

/** Entry fields of a node state. */
type Entry = { name: string; position: { x: number; y: number; z: number } };

/**
 * Builds a replica of a world with a box inside a group.
 *
 * @returns Replica, group id and box id.
 */
function replicaBuild(): { replica: ReplicaCollaborationScene; group: string; box: string } {
  const world = new THREE.Group();
  const group = new THREE.Group();
  group.name = 'Group';
  const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  box.name = 'Box';
  group.add(box);
  world.add(group);
  const normalized = new THREE.Group();
  new SceneDeserializer().deserialize(new SceneSerializer().serialize(world), normalized);
  const replica = new ReplicaCollaborationScene(normalized);
  replica.locks.selfSet(1);
  replica.baselineInitialize();
  const ids = replica.applier.nodes().refs.map((ref) => ref.id);
  return { replica, group: ids[0] ?? '', box: ids[1] ?? '' };
}

/**
 * Returns the agreed state of a node.
 *
 * @param replica Replica.
 * @param id Node id.
 * @returns State copy.
 */
function agreed(replica: ReplicaCollaborationScene, id: string): NodeCollaborationState {
  return JSON.parse(JSON.stringify(replica.baselines.get(id)?.state)) as NodeCollaborationState;
}

/**
 * Returns the entry fields of a state.
 *
 * @param state State.
 * @returns Entry.
 */
function entryOf(state: NodeCollaborationState | undefined): Entry {
  return (state as unknown as { data: { entry: Entry } }).data.entry;
}

/**
 * Applies another member's change of a node.
 *
 * @param replica Replica.
 * @param id Node id.
 * @param change Mutates the state.
 * @param fields Field paths the change names.
 */
function remoteEdit(
  replica: ReplicaCollaborationScene,
  id: string,
  change: (entry: Entry) => void,
  fields: string[],
): void {
  const state = agreed(replica, id);
  change(entryOf(state));
  replica.remoteApply([{ k: 'property', ids: [id], d: { s: state, f: fields } }]);
}

/** Per-user undo as a field-level last-writer-wins inverse. */
describe('history_collaboration_apply', () => {
  it("undoes only the fields of the step and keeps another member's later fields", () => {
    const { replica, box } = replicaBuild();
    const before = agreed(replica, box);
    const after = agreed(replica, box);
    entryOf(after).name = 'Renamed';
    replica.remoteApply([{ k: 'property', ids: [box], d: { s: after, f: ['data.entry.name'] } }]);
    remoteEdit(replica, box, (entry) => (entry.position = { x: 5, y: 0, z: 0 }), ['data.entry.position']);
    const applied = historyCollaborationApply(replica, { changes: [{ id: box, before, after }] }, false);
    expect(applied.skipped).toEqual([]);
    const state = entryOf(replica.baselines.get(box)?.state);
    expect(state.name).toBe('Box');
    expect(state.position.x).toBe(5);
    expect(applied.ops[0]?.d).toMatchObject({ f: ['data.entry.name'] });
  });

  it('skips a step whose node another member deleted (never resurrects it)', () => {
    const { replica, box } = replicaBuild();
    const before = agreed(replica, box);
    const after = agreed(replica, box);
    entryOf(after).name = 'Renamed';
    replica.remoteApply([{ k: 'delete', ids: [box] }]);
    const applied = historyCollaborationApply(replica, { changes: [{ id: box, before, after }] }, false);
    expect(applied.skipped).toEqual([{ id: box, reason: 'deleted' }]);
    expect(applied.ops).toEqual([]);
    expect(replica.applier.nodes().get(box)).toBeUndefined();
  });

  it('keeps an own created container another member added children to', () => {
    const { replica, group, box } = replicaBuild();
    const created = agreed(replica, group);
    const applied = historyCollaborationApply(
      replica,
      { changes: [{ id: group, before: null, after: created }] },
      false,
    );
    expect(applied.skipped).toEqual([{ id: group, reason: 'foreign_children' }]);
    expect(replica.applier.nodes().get(box)).toBeDefined();
  });

  it("refuses a step only while another member's lease covers its node", () => {
    const { replica, box } = replicaBuild();
    const before = agreed(replica, box);
    const after = agreed(replica, box);
    const entry = { changes: [{ id: box, before, after }] };
    expect(historyCollaborationCheck(replica, entry, false)).toEqual({ ok: true });
    replica.locks.apply(2, [box], []);
    expect(historyCollaborationCheck(replica, entry, false)).toMatchObject({ ok: false, id: box, holder: 2 });
    replica.locks.apply(2, [], [box]);
    expect(historyCollaborationCheck(replica, entry, false)).toEqual({ ok: true });
  });
});
