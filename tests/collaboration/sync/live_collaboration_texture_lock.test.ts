import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import { SceneDeserializer } from '@/io/scene/scene_deserializer.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import type { TextureLockFlags } from '@/texture/lock/texture_lock_transform.js';
import { ReplicaCollaborationScene } from '@/collaboration/sync/replica_collaboration_scene.js';
import { TrackerCollaboration } from '@/collaboration/sync/tracker_collaboration_commit.js';
import { LiveCollaborationTicker } from '@/collaboration/sync/live_collaboration_ticker.js';
import type { EditOperation } from '@/collaboration/shared/protocol_definitions.js';

/**
 * Builds a world with a solid model holding one box brush, normalized through
 * save and load like editor content.
 *
 * @returns World group.
 */
function worldBuild(): THREE.Group {
  const world = new THREE.Group();
  const model = new SolidModel('Solid');
  model.addBoxBrush(2, SolidOperation.Additive);
  world.add(model.root);
  const normalized = new THREE.Group();
  new SceneDeserializer().deserialize(new SceneSerializer().serialize(world), normalized);
  return normalized;
}

/** Owner and joiner replicas plus the wire id of the brush. */
interface LiveLockRoom {
  owner: ReplicaCollaborationScene;
  joiner: ReplicaCollaborationScene;
  brushId: string;
}

/**
 * Creates an owner replica and a joiner synced from its snapshot.
 *
 * @returns Room.
 */
function roomBuild(): LiveLockRoom {
  const owner = new ReplicaCollaborationScene(worldBuild());
  owner.locks.selfSet(1);
  owner.baselineInitialize();
  const joiner = new ReplicaCollaborationScene(new THREE.Group());
  joiner.locks.selfSet(2);
  joiner.snapshotApply(JSON.parse(JSON.stringify(owner.snapshotStates())));
  const brush = owner.applier.nodes().refs.find((ref) => ref.kind === 'brush');
  if (brush === undefined) throw new Error('no brush');
  return { owner, joiner, brushId: brush.id };
}

/**
 * Returns the solid model and its only brush of a replica.
 *
 * @param replica Replica.
 * @returns Model and brush instance.
 */
function solidOf(replica: ReplicaCollaborationScene): {
  model: SolidModel;
  brush: ReturnType<SolidModel['getBrushes']>[number];
} {
  replica.applier.invalidate();
  const ref = replica.applier.nodes().refs.find((candidate) => candidate.kind === 'brush');
  const model = ref?.model ?? null;
  const brush = model?.getBrushes()[0];
  if (model === null || brush === undefined) throw new Error('no solid brush');
  return { model, brush };
}

/**
 * Serializes the UV matrices of every face of the only brush of a replica.
 *
 * @param replica Replica.
 * @returns UV rows per face.
 */
function uvRows(replica: ReplicaCollaborationScene): number[][] {
  const { brush } = solidOf(replica);
  return brush.brush.faces.map((_face, index) => {
    const uv = brush.getFaceSurface(index).uv;
    return [...uv.u.toArray(), ...uv.v.toArray()];
  });
}

/**
 * Asserts two UV row sets match closely.
 *
 * @param actual Actual rows.
 * @param expected Expected rows.
 */
function expectRowsClose(actual: number[][], expected: number[][]): void {
  expect(actual.length).toBe(expected.length);
  actual.forEach((row, face) => row.forEach((value, index) => expect(value).toBeCloseTo(expected[face]![index]!, 6)));
}

/**
 * Drags the owner's brush like one live gizmo frame: sets the mesh pose and
 * pulls it with texture locks, as the solid model controller does.
 *
 * @param room Room.
 * @param locks Lock flags of the drag.
 * @param scale X scale of the frame.
 * @param x X position of the frame.
 */
function ownerFrame(room: LiveLockRoom, locks: TextureLockFlags, scale: number, x: number): void {
  const { model, brush } = solidOf(room.owner);
  const mesh = brush.mesh!;
  mesh.scale.set(scale, 1, 1);
  mesh.position.set(x, 0, 0);
  mesh.updateMatrixWorld(true);
  model.prepareLiveBrushEdit([mesh], locks);
  model.rebuildLive();
}

/**
 * Collects the owner's live operations of the held brush.
 *
 * @param room Room.
 * @param ticker Owner ticker.
 * @param now Tick time.
 * @returns Operations.
 */
function ownerTick(room: LiveLockRoom, ticker: LiveCollaborationTicker, now: number): EditOperation[] {
  room.owner.applier.invalidate();
  return JSON.parse(JSON.stringify(ticker.collect(16, now))) as EditOperation[];
}

const cases: [string, TextureLockFlags][] = [
  ['Stretch Lock off (world-fixed density)', { positionLock: true, stretchLock: false }],
  ['Pos Lock off', { positionLock: false, stretchLock: true }],
  ['both locks off', { positionLock: false, stretchLock: false }],
  ['both locks on', { positionLock: true, stretchLock: true }],
];

describe('live collaboration previews keep texture locks', () => {
  it.each(cases)('a peer previews a resized brush with the dragger UVs: %s', (_label, locks) => {
    const room = roomBuild();
    const tracker = new TrackerCollaboration(room.owner, 1 << 20);
    const ticker = new LiveCollaborationTicker(room.owner, tracker, () => locks);
    room.owner.locks.requestSet([room.brushId]);
    let now = 1000;
    for (const [scale, x] of [
      [1.25, 0.25],
      [1.5, 0.5],
      [2, 0.5],
    ] as const) {
      ownerFrame(room, locks, scale, x);
      now += 33;
      room.joiner.remoteApply(ownerTick(room, ticker, now));
      expectRowsClose(uvRows(room.joiner), uvRows(room.owner));
    }
    const { brush } = solidOf(room.joiner);
    expect(brush.mesh!.scale.x).toBeCloseTo(2, 6);
  });

  it('a peer previews a moved brush with Pos Lock off', () => {
    const room = roomBuild();
    const locks: TextureLockFlags = { positionLock: false, stretchLock: false };
    const tracker = new TrackerCollaboration(room.owner, 1 << 20);
    const ticker = new LiveCollaborationTicker(room.owner, tracker, () => locks);
    room.owner.locks.requestSet([room.brushId]);
    let now = 1000;
    for (const x of [0.3, 0.7, 1.1]) {
      ownerFrame(room, locks, 1, x);
      now += 33;
      room.joiner.remoteApply(ownerTick(room, ticker, now));
      expectRowsClose(uvRows(room.joiner), uvRows(room.owner));
    }
  });

  it('a later drag starts from the agreed UVs after a commit', () => {
    const room = roomBuild();
    const locks: TextureLockFlags = { positionLock: true, stretchLock: false };
    const tracker = new TrackerCollaboration(room.owner, 1 << 20);
    const ticker = new LiveCollaborationTicker(room.owner, tracker, () => locks);
    room.owner.locks.requestSet([room.brushId]);
    ownerFrame(room, locks, 2, 0.5);
    room.joiner.remoteApply(ownerTick(room, ticker, 1033));
    expectRowsClose(uvRows(room.joiner), uvRows(room.owner));
    // The commit: the owner's final brush state becomes agreed on both sides.
    solidOf(room.owner).model.finalizeAfterInteractiveEdit();
    room.owner.applier.invalidate();
    const ref = room.owner.applier.nodes().get(room.brushId)!;
    const parent = room.owner.applier.nodes().parents.get(room.brushId) ?? '';
    const state = room.owner.codec.encode(ref, parent, room.owner.keyOf(room.brushId) ?? '')!;
    room.joiner.statesApply([JSON.parse(JSON.stringify(state))], [], new Map(), false);
    room.owner.statesApply([state], [], new Map(), false);
    ticker.reset();
    ownerFrame(room, locks, 3, 1);
    room.joiner.remoteApply(ownerTick(room, ticker, 2000));
    expectRowsClose(uvRows(room.joiner), uvRows(room.owner));
  });

  it('live brush poses carry lock bits only when a lock is off', () => {
    const room = roomBuild();
    let locks: TextureLockFlags | null = { positionLock: true, stretchLock: false };
    const tracker = new TrackerCollaboration(room.owner, 1 << 20);
    const ticker = new LiveCollaborationTicker(room.owner, tracker, () => locks);
    room.owner.locks.requestSet([room.brushId]);
    ownerFrame(room, { positionLock: true, stretchLock: false }, 2, 0.5);
    const off = ownerTick(room, ticker, 1033).find((op) => op.k === 'transform');
    expect((off?.d as { l?: unknown }).l).toEqual([1, 0]);
    locks = { positionLock: true, stretchLock: true };
    ownerFrame(room, locks, 3, 0.5);
    const on = ownerTick(room, ticker, 1066).find((op) => op.k === 'transform');
    expect(on).toBeDefined();
    expect((on?.d as { l?: unknown }).l).toBeUndefined();
    locks = null;
    ownerFrame(room, { positionLock: true, stretchLock: true }, 4, 0.5);
    const none = ownerTick(room, ticker, 1099).find((op) => op.k === 'transform');
    expect((none?.d as { l?: unknown }).l).toBeUndefined();
  });

  it('ignores malformed lock bits and keeps brush-local UVs', () => {
    const room = roomBuild();
    const before = uvRows(room.joiner);
    for (const l of [[1], [2, 0], 'x', [true, false]]) {
      room.joiner.remoteApply([
        { k: 'transform', ids: [room.brushId], d: { live: 1, t: [0, 0, 0, 0, 0, 0, 1, 2, 1, 1], l } } as EditOperation,
      ]);
      expectRowsClose(uvRows(room.joiner), before);
    }
  });
});
