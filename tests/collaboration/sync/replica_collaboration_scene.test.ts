import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import { SceneDeserializer } from '@/io/scene/scene_deserializer.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { ReplicaCollaborationScene } from '@/collaboration/sync/replica_collaboration_scene.js';
import { TrackerCollaboration } from '@/collaboration/sync/tracker_collaboration_commit.js';
import { codecStateText } from '@/collaboration/scene/node_collaboration_codec.js';

/**
 * Builds a world with a plain mesh inside a group and a solid model with two
 * brushes, normalized through save and load like editor content.
 *
 * @returns World group.
 */
function worldBuild(): THREE.Group {
  const world = new THREE.Group();
  const group = new THREE.Group();
  group.name = 'Group';
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  mesh.name = 'Box';
  group.add(mesh);
  world.add(group);
  const model = new SolidModel('Solid');
  model.addBoxBrush(2, SolidOperation.Additive);
  model.addBoxBrush(1, SolidOperation.Subtractive);
  world.add(model.root);
  const normalized = new THREE.Group();
  new SceneDeserializer().deserialize(new SceneSerializer().serialize(world), normalized);
  return normalized;
}

/**
 * Returns the encoded text of every node of a replica in scene order.
 *
 * @param replica Replica.
 * @returns Encoded node texts.
 */
function replicaTexts(replica: ReplicaCollaborationScene): string[] {
  replica.applier.invalidate();
  const nodes = replica.applier.nodes();
  return nodes.refs.map((ref) => {
    const state = replica.codec.encode(ref, nodes.parents.get(ref.id) ?? '', replica.keyOf(ref.id) ?? '');
    return state === null ? '' : codecStateText(state);
  });
}

/**
 * Creates an owner replica of a built world and a joiner replica synced from
 * its snapshot.
 *
 * @returns Owner and joiner replicas.
 */
function replicasPair(): { owner: ReplicaCollaborationScene; joiner: ReplicaCollaborationScene } {
  const owner = new ReplicaCollaborationScene(worldBuild());
  owner.locks.selfSet(1);
  owner.baselineInitialize();
  const joiner = new ReplicaCollaborationScene(new THREE.Group());
  joiner.locks.selfSet(2);
  joiner.snapshotApply(JSON.parse(JSON.stringify(owner.snapshotStates())));
  return { owner, joiner };
}

describe('ReplicaCollaborationScene', () => {
  it('reproduces the owner scene from a snapshot', () => {
    const { owner, joiner } = replicasPair();
    expect(replicaTexts(joiner)).toEqual(replicaTexts(owner));
    expect(joiner.baselines.size).toBe(owner.baselines.size);
  });

  it('sends held changes and applies them on the joiner', () => {
    const { owner, joiner } = replicasPair();
    const tracker = new TrackerCollaboration(owner, 1 << 20);
    const brush = owner.applier.nodes().refs.find((ref) => ref.kind === 'brush');
    if (brush === undefined) throw new Error('missing brush');
    owner.locks.requestSet([brush.id]);
    const offset = new THREE.Vector3(Math.random() + 1, Math.random() + 1, 0);
    brush.object.position.add(offset);
    const commit = tracker.commit();
    expect(commit.ops.map((op) => op.ids[0])).toEqual([brush.id]);
    joiner.remoteApply(JSON.parse(JSON.stringify(commit.ops)));
    expect(joiner.applier.nodes().get(brush.id)?.object.position.toArray()).toEqual(brush.object.position.toArray());
    expect(replicaTexts(joiner)).toEqual(replicaTexts(owner));
  });

  it('reverts changes to nodes the user does not hold', () => {
    const { owner } = replicasPair();
    const tracker = new TrackerCollaboration(owner, 1 << 20);
    const mesh = owner.applier.nodes().refs.find((ref) => ref.object instanceof THREE.Mesh && ref.kind === 'entry');
    if (mesh === undefined) throw new Error('missing mesh');
    owner.locks.apply(5, [mesh.id], []);
    const before = mesh.object.position.toArray();
    mesh.object.position.x += 1 + Math.random();
    const commit = tracker.commit();
    expect(commit.ops).toEqual([]);
    expect(commit.reverted).toEqual([mesh.id]);
    expect(owner.applier.nodes().get(mesh.id)?.object.position.toArray()).toEqual(before);
  });

  it('creates and deletes nodes', () => {
    const { owner, joiner } = replicasPair();
    const tracker = new TrackerCollaboration(owner, 1 << 20);
    const added = new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshStandardMaterial());
    owner.world.add(added);
    const created = tracker.commit();
    expect(created.created).toEqual([added.uuid]);
    joiner.remoteApply(JSON.parse(JSON.stringify(created.ops)));
    expect(joiner.applier.nodes().get(added.uuid)).toBeDefined();
    owner.locks.requestSet([added.uuid]);
    added.removeFromParent();
    const deleted = tracker.commit();
    expect(deleted.ops).toEqual([{ k: 'delete', ids: [added.uuid] }]);
    joiner.remoteApply(deleted.ops);
    expect(joiner.applier.nodes().get(added.uuid)).toBeUndefined();
    expect(replicaTexts(joiner)).toEqual(replicaTexts(owner));
  });
});
