import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import { SceneDeserializer } from '@/io/scene/scene_deserializer.js';
import { initializeMeshTextureUVs } from '@/texture/uv/face_texture_applier.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import { ToolPrimitiveCreation } from '@/tools/creation/tool_primitive_creation.js';
import { TextureLockSettings } from '@/texture/lock/texture_lock_settings.js';
import type { TextureLockFlags } from '@/texture/lock/texture_lock_transform.js';
import {
  captureTransformTextureState,
  restoreTransformTextureState,
} from '@/transform/commands/state_transform_texture.js';
import { ReplicaCollaborationScene } from '@/collaboration/sync/replica_collaboration_scene.js';
import { TrackerCollaboration } from '@/collaboration/sync/tracker_collaboration_commit.js';
import { LiveCollaborationTicker } from '@/collaboration/sync/live_collaboration_ticker.js';
import type { EditOperation } from '@/collaboration/shared/protocol_definitions.js';
import type { NodeCollaborationEntryData } from '@/collaboration/scene/node_collaboration_types.js';

/**
 * Mesh names of the test world: small primitives relayed with literal UVs, a
 * default sphere too dense for them, and an imported buffer mesh.
 */
const MESHES = ['Box', 'Ball', 'Cylinder', 'Dense', 'Imported', 'ToolBox', 'ToolSphere', 'ToolCylinder'] as const;

/**
 * Builds a world with a box, a sphere and a plain buffer mesh, textured like
 * the creation tools do and normalized through save and load.
 *
 * @returns World group.
 */
function worldBuild(): THREE.Group {
  const world = new THREE.Group();
  const imported = new THREE.BufferGeometry().copy(new THREE.TorusGeometry(1, 0.3, 6, 8));
  const geometries = [
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.SphereGeometry(1, 8, 6),
    new THREE.CylinderGeometry(1, 1, 2, 32),
    new THREE.SphereGeometry(1, 32, 32),
    imported,
  ];
  MESHES.slice(0, geometries.length).forEach((name, index) => {
    const mesh = new THREE.Mesh(geometries[index], new THREE.MeshStandardMaterial());
    mesh.name = name;
    mesh.position.set(index * 3, 0.5, 0.25);
    initializeMeshTextureUVs(mesh, DEFAULT_CHECKER_TEXTURE_ID);
    world.add(mesh);
  });
  toolPrimitivesAdd(world);
  const normalized = new THREE.Group();
  new SceneDeserializer().deserialize(new SceneSerializer().serialize(world), normalized);
  return normalized;
}

/**
 * Adds a box, sphere and cylinder made by the editor's primitive creation tool.
 *
 * @param world World group.
 */
function toolPrimitivesAdd(world: THREE.Group): void {
  const tool = new ToolPrimitiveCreation(world);
  const meshes = [tool.createBox(1, 1, 1), tool.createSphere(0.5), tool.createCylinder(0.5, 0.5, 1)];
  ['ToolBox', 'ToolSphere', 'ToolCylinder'].forEach((name, index) => {
    const mesh = meshes[index];
    if (mesh === undefined) return;
    mesh.name = name;
    mesh.position.set(index * 3, 0.5, -4);
    world.add(mesh);
  });
}

/** Two replicas and the tools of the member that drags. */
interface MeshLockRoom {
  owner: ReplicaCollaborationScene;
  joiner: ReplicaCollaborationScene;
}

/** The dragging side of a room. */
interface MeshLockDragger {
  replica: ReplicaCollaborationScene;
  peer: ReplicaCollaborationScene;
  tracker: TrackerCollaboration;
  ticker: LiveCollaborationTicker;
  lock: TextureLockSettings;
}

/**
 * Creates an owner replica and a joiner synced from its snapshot.
 *
 * @returns Room.
 */
function roomBuild(): MeshLockRoom {
  const owner = new ReplicaCollaborationScene(worldBuild());
  owner.locks.selfSet(1);
  owner.baselineInitialize();
  const joiner = new ReplicaCollaborationScene(new THREE.Group());
  joiner.locks.selfSet(2);
  joiner.snapshotApply(JSON.parse(JSON.stringify(owner.snapshotStates())));
  return { owner, joiner };
}

/**
 * Sets up one side of a room as the dragger of a mesh.
 *
 * @param room Room.
 * @param side Which member drags.
 * @param name Dragged mesh.
 * @param locks Texture locks of the drag.
 * @returns Dragger.
 */
function draggerBuild(room: MeshLockRoom, side: 'owner' | 'joiner', name: string, locks: TextureLockFlags) {
  const replica = side === 'owner' ? room.owner : room.joiner;
  const peer = side === 'owner' ? room.joiner : room.owner;
  const tracker = new TrackerCollaboration(replica, 1 << 20);
  const ticker = new LiveCollaborationTicker(replica, tracker, () => locks);
  replica.locks.requestSet([idOf(replica, name)]);
  const lock = new TextureLockSettings(locks.positionLock, locks.stretchLock);
  return { replica, peer, tracker, ticker, lock } satisfies MeshLockDragger;
}

/**
 * Returns the mesh named so in a replica.
 *
 * @param replica Replica.
 * @param name Object name.
 * @returns Mesh.
 */
function meshOf(replica: ReplicaCollaborationScene, name: string): THREE.Mesh {
  replica.applier.invalidate();
  const object = replica.applier.nodes().refs.find((ref) => ref.object.name === name)?.object;
  if (!(object instanceof THREE.Mesh)) throw new Error(`missing ${name}`);
  return object;
}

/**
 * Returns the wire id of the object named so.
 *
 * @param replica Replica.
 * @param name Object name.
 * @returns Wire id.
 */
function idOf(replica: ReplicaCollaborationScene, name: string): string {
  replica.applier.invalidate();
  const ref = replica.applier.nodes().refs.find((candidate) => candidate.object.name === name);
  if (ref === undefined) throw new Error(`missing ${name}`);
  return ref.id;
}

/**
 * Returns the vertex UVs of a mesh.
 *
 * @param replica Replica.
 * @param name Object name.
 * @returns UV components.
 */
function uvsOf(replica: ReplicaCollaborationScene, name: string): number[] {
  return Array.from(meshOf(replica, name).geometry.getAttribute('uv').array as ArrayLike<number>);
}

/**
 * Asserts the peer shows the dragger's UVs and scale.
 *
 * @param dragger Dragger.
 * @param name Mesh name.
 */
function expectPeerUvs(dragger: MeshLockDragger, name: string): void {
  const expected = uvsOf(dragger.replica, name);
  const actual = uvsOf(dragger.peer, name);
  expect(actual.length).toBe(expected.length);
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index] ?? NaN, 5));
  expect(meshOf(dragger.peer, name).scale.toArray()).toEqual(meshOf(dragger.replica, name).scale.toArray());
}

/**
 * Applies one live transform frame to the dragged mesh the way the gizmo and
 * bounds tools do, texture lock policy included.
 *
 * @param dragger Dragger.
 * @param name Mesh name.
 * @param scale X scale.
 * @param x X offset from the start.
 */
function dragFrame(dragger: MeshLockDragger, name: string, scale: number, x: number): void {
  const mesh = meshOf(dragger.replica, name);
  const scaled = mesh.scale.x !== scale;
  mesh.scale.set(scale, 1, 1);
  mesh.position.x += x;
  mesh.updateMatrixWorld(true);
  dragger.lock.applyContentTransformPolicy([mesh], !scaled && x !== 0, scaled);
}

/**
 * Relays the dragger's live operations of one tick to the peer.
 *
 * @param dragger Dragger.
 * @param now Tick time.
 * @returns Relayed operations.
 */
function liveRelay(dragger: MeshLockDragger, now: number): EditOperation[] {
  dragger.replica.applier.invalidate();
  const ops = JSON.parse(JSON.stringify(dragger.ticker.collect(16, now))) as EditOperation[];
  dragger.peer.remoteApply(ops);
  return ops;
}

/**
 * Commits the dragger's edit and relays it to the peer as the relay echoes it.
 *
 * @param dragger Dragger.
 * @returns Committed operations.
 */
function commitRelay(dragger: MeshLockDragger): EditOperation[] {
  const commit = dragger.tracker.commit();
  const ops = JSON.parse(JSON.stringify(commit.ops)) as EditOperation[];
  dragger.peer.remoteApply(ops);
  dragger.replica.remoteApply(JSON.parse(JSON.stringify(ops)));
  dragger.ticker.reset();
  dragger.peer.applier.invalidate();
  expect(new TrackerCollaboration(dragger.peer, 1 << 20).commit().ops).toEqual([]);
  return ops;
}

const LOCK_CASES: [string, TextureLockFlags][] = [
  ['Stretch Lock off', { positionLock: true, stretchLock: false }],
  ['Stretch Lock on', { positionLock: true, stretchLock: true }],
  ['both locks off', { positionLock: false, stretchLock: false }],
];

const SIDE_CASES = ['owner', 'joiner'] as const;

const CASES = MESHES.flatMap((name) =>
  SIDE_CASES.flatMap((side) => LOCK_CASES.map(([label, locks]) => [name, side, label, locks] as const)),
);

describe('collaboration keeps the dragger UVs of resized world meshes', () => {
  it.for(CASES)('%s dragged by the %s, %s: preview, commit, undo and late join', ([name, side, , locks]) => {
    const room = roomBuild();
    const dragger = draggerBuild(room, side, name, locks);
    const before = captureTransformTextureState([meshOf(dragger.replica, name)]);
    let now = 1000;
    for (const scale of [1.5, 2, 2.5]) {
      dragFrame(dragger, name, scale, 0);
      liveRelay(dragger, now);
      expectPeerUvs(dragger, name);
      now += 16;
    }
    commitRelay(dragger);
    expectPeerUvs(dragger, name);
    const mesh = meshOf(dragger.replica, name);
    mesh.scale.set(1, 1, 1);
    mesh.updateMatrixWorld(true);
    restoreTransformTextureState(before);
    commitRelay(dragger);
    expectPeerUvs(dragger, name);
    const late = new ReplicaCollaborationScene(new THREE.Group());
    late.locks.selfSet(3);
    dragFrame(dragger, name, 3, 0);
    commitRelay(dragger);
    late.snapshotApply(JSON.parse(JSON.stringify(dragger.replica.snapshotStates())));
    expectPeerUvs({ ...dragger, peer: late }, name);
  });

  it.for(LOCK_CASES)('a peer previews pose-only frames with the dragger UVs: %s', ([, locks]) => {
    const room = roomBuild();
    const dragger = draggerBuild(room, 'owner', 'Box', locks);
    liveRelay(dragger, 1000);
    let poses = 0;
    for (const scale of [1.25, 1.5, 1.75]) {
      dragFrame(dragger, 'Box', scale, 0);
      const ops = liveRelay(dragger, 1010);
      poses += ops.filter((op) => (op.d as { t?: unknown }).t !== undefined).length;
      expectPeerUvs(dragger, 'Box');
    }
    expect(poses).toBeGreaterThanOrEqual(2);
  });

  it('a peer previews a Pos Lock off move with the dragger UVs', () => {
    const room = roomBuild();
    const dragger = draggerBuild(room, 'joiner', 'Box', { positionLock: false, stretchLock: true });
    liveRelay(dragger, 1000);
    for (const x of [0.3, 0.4, 0.5]) {
      dragFrame(dragger, 'Box', 1, x);
      liveRelay(dragger, 1010);
      expectPeerUvs(dragger, 'Box');
    }
    commitRelay(dragger);
    expectPeerUvs(dragger, 'Box');
  });

  it.for(LOCK_CASES)('a save and restore keeps the committed UVs: %s', ([, locks]) => {
    const room = roomBuild();
    const dragger = draggerBuild(room, 'owner', 'Box', locks);
    dragFrame(dragger, 'Box', 2, 0);
    commitRelay(dragger);
    const restored = new THREE.Group();
    new SceneDeserializer().deserialize(new SceneSerializer().serialize(room.joiner.world), restored);
    const mesh = restored.children.find((child) => child.name === 'Box') as THREE.Mesh;
    const expected = uvsOf(room.owner, 'Box');
    const actual = Array.from(mesh.geometry.getAttribute('uv').array as ArrayLike<number>);
    actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index] ?? NaN, 5));
  });

  it('commits of primitive meshes carry the literal UVs as an optional field', () => {
    const room = roomBuild();
    const dragger = draggerBuild(room, 'owner', 'Box', { positionLock: true, stretchLock: false });
    dragFrame(dragger, 'Box', 2, 0);
    const commit = dragger.tracker.commit();
    const state = (commit.ops[0]?.d as { s: { data: NodeCollaborationEntryData } }).s;
    expect(state.data.uv).toEqual(uvsOf(room.owner, 'Box'));
    expect(commit.changes[0]?.before?.data).toHaveProperty('uv');
  });
});
