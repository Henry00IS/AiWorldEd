import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import { SceneDeserializer } from '@/io/scene/scene_deserializer.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { ReplicaCollaborationScene } from '@/collaboration/sync/replica_collaboration_scene.js';
import { TrackerCollaboration } from '@/collaboration/sync/tracker_collaboration_commit.js';
import { codecStateText } from '@/collaboration/scene/node_collaboration_codec.js';
import type { NodeCollaborationRef } from '@/collaboration/scene/node_collaboration_types.js';

const OWNER = 1;
const JOINER = 2;
const OTHER = 3;

/** One editor mutation and the node whose lock it needs. */
interface MutationCase {
  name: string;
  target: (replica: ReplicaCollaborationScene) => NodeCollaborationRef;
  mutate: (replica: ReplicaCollaborationScene, ref: NodeCollaborationRef) => void;
  rebuilds?: boolean;
}

/**
 * Builds a world with a mesh inside a group and a solid model with two brushes,
 * normalized through save and load like editor content.
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
 * Returns the agreed baseline texts by node id. Geometry re-indexing on apply
 * makes live encodings differ textually while the agreed states match.
 *
 * @param replica Replica.
 * @returns Sorted baseline texts.
 */
function agreedTexts(replica: ReplicaCollaborationScene): string[] {
  return [...replica.baselines.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, baseline]) => baseline.text);
}

/**
 * Creates an owner replica and a joiner synced from its snapshot.
 *
 * @returns Owner and joiner.
 */
function replicasPair(): { owner: ReplicaCollaborationScene; joiner: ReplicaCollaborationScene } {
  const owner = new ReplicaCollaborationScene(worldBuild());
  owner.locks.selfSet(OWNER);
  owner.baselineInitialize();
  const joiner = new ReplicaCollaborationScene(new THREE.Group());
  joiner.locks.selfSet(JOINER);
  joiner.snapshotApply(JSON.parse(JSON.stringify(owner.snapshotStates())));
  return { owner, joiner };
}

/**
 * Finds a node by object name.
 *
 * @param replica Replica.
 * @param name Object name.
 * @returns Node.
 */
function refNamed(replica: ReplicaCollaborationScene, name: string): NodeCollaborationRef {
  replica.applier.invalidate();
  const ref = replica.applier.nodes().refs.find((candidate) => candidate.object.name === name);
  if (ref === undefined) throw new Error(`missing ${name}`);
  return ref;
}

/**
 * Finds the first solid brush.
 *
 * @param replica Replica.
 * @returns Brush node.
 */
function refBrush(replica: ReplicaCollaborationScene): NodeCollaborationRef {
  replica.applier.invalidate();
  const ref = replica.applier.nodes().refs.find((candidate) => candidate.kind === 'brush');
  if (ref === undefined) throw new Error('missing brush');
  return ref;
}

/**
 * Returns a random non-trivial offset.
 *
 * @returns Offset.
 */
function offset(): number {
  return 0.5 + Math.random();
}

const MUTATIONS: MutationCase[] = [
  {
    name: 'translate',
    target: (r) => refNamed(r, 'Box'),
    mutate: (_, ref) => void (ref.object.position.x += offset()),
  },
  { name: 'rotate', target: (r) => refNamed(r, 'Box'), mutate: (_, ref) => void (ref.object.rotation.y += offset()) },
  {
    name: 'scale',
    target: (r) => refNamed(r, 'Box'),
    mutate: (_, ref) => ref.object.scale.multiplyScalar(1 + offset()),
  },
  { name: 'rename', target: (r) => refNamed(r, 'Box'), mutate: (_, ref) => void (ref.object.name = `Box ${offset()}`) },
  { name: 'visibility', target: (r) => refNamed(r, 'Box'), mutate: (_, ref) => void (ref.object.visible = false) },
  {
    name: 'material color',
    rebuilds: true,
    target: (r) => refNamed(r, 'Box'),
    mutate: (_, ref) =>
      ((ref.object as THREE.Mesh).material as THREE.MeshStandardMaterial).color.setRGB(offset() / 2, 0, 0),
  },
  {
    name: 'vertex edit',
    rebuilds: true,
    target: (r) => refNamed(r, 'Box'),
    mutate: (_, ref) => {
      const mesh = ref.object as THREE.Mesh;
      const edited = new THREE.BufferGeometry().copy(mesh.geometry);
      edited.userData = {};
      const attribute = edited.getAttribute('position');
      attribute.setX(0, attribute.getX(0) + offset());
      mesh.geometry = edited;
    },
  },
  {
    name: 'reparent',
    target: (r) => refNamed(r, 'Box'),
    mutate: (replica, ref) => replica.world.attach(ref.object),
  },
  {
    name: 'group transform',
    target: (r) => refNamed(r, 'Group'),
    mutate: (_, ref) => void (ref.object.position.z += offset()),
  },
  {
    name: 'CSG brush transform',
    target: (r) => refBrush(r),
    mutate: (_, ref) => void (ref.object.position.y += offset()),
  },
];

/** Every mutation type syncs when the lock is held and is reverted otherwise. */
describe('tracker collaboration mutations', () => {
  it.each(MUTATIONS)('syncs $name to the joiner under the selection lock', ({ target, mutate }) => {
    const { owner, joiner } = replicasPair();
    const tracker = new TrackerCollaboration(owner, 1 << 20);
    const ref = target(owner);
    owner.locks.requestSet([ref.id]);
    mutate(owner, ref);
    const commit = tracker.commit();
    expect(commit.ops.length).toBeGreaterThan(0);
    joiner.remoteApply(JSON.parse(JSON.stringify(commit.ops)));
    expect(agreedTexts(joiner)).toEqual(agreedTexts(owner));
    expect(replicaTexts(joiner)).toHaveLength(replicaTexts(owner).length);
  });

  it.each(MUTATIONS)('reverts $name while another member holds the object', ({ target, mutate, rebuilds }) => {
    const { owner } = replicasPair();
    const tracker = new TrackerCollaboration(owner, 1 << 20);
    const before = replicaTexts(owner);
    const ref = target(owner);
    owner.locks.apply(OTHER, [ref.id], []);
    mutate(owner, ref);
    const commit = tracker.commit();
    expect(commit.ops).toEqual([]);
    expect(commit.reverted).toContain(ref.id);
    expect(replicaTexts(owner)).toEqual(before);
    if (rebuilds !== true) expect(owner.applier.nodes().get(ref.id)?.object).toBe(ref.object);
  });

  it('applies concurrent edits from two members in the same order on both replicas', () => {
    const { owner, joiner } = replicasPair();
    const ownerTracker = new TrackerCollaboration(owner, 1 << 20);
    const joinerTracker = new TrackerCollaboration(joiner, 1 << 20);
    const box = refNamed(owner, 'Box');
    const brush = refBrush(joiner);
    owner.locks.requestSet([box.id]);
    owner.locks.apply(JOINER, [brush.id], []);
    joiner.locks.requestSet([brush.id]);
    joiner.locks.apply(OWNER, [box.id], []);
    box.object.position.x += offset();
    brush.object.position.y += offset();
    const ownerOps = JSON.parse(JSON.stringify(ownerTracker.commit().ops));
    const joinerOps = JSON.parse(JSON.stringify(joinerTracker.commit().ops));
    owner.remoteApply(joinerOps);
    joiner.remoteApply(ownerOps);
    expect(agreedTexts(joiner)).toEqual(agreedTexts(owner));
    expect(replicaTexts(joiner)).toEqual(replicaTexts(owner));
  });
});
