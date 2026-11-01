import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ReplicaCollaborationScene } from '@/collaboration/sync/replica_collaboration_scene.js';
import { TrackerCollaboration } from '@/collaboration/sync/tracker_collaboration_commit.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import {
  CommandSolidBrushesReorder,
  type SolidBrushOrderEnd,
} from '@/solid/commands/brushes/command_solid_brushes_reorder.js';
import type { EditOperation } from '@/collaboration/shared/protocol_definitions.js';

const BRUSH_COUNT = 24;

/** Owner and member replicas holding the same chain of overlapping brushes. */
interface IncrementalRoom {
  ownerModel: SolidModel;
  memberModel: SolidModel;
  member: ReplicaCollaborationScene;
  tracker: TrackerCollaboration;
}

/**
 * Builds a solid of overlapping boxes in a row, where each box only touches its
 * neighbours, so a partial rebuild stays local.
 *
 * @returns Solid model.
 */
function chainModelBuild(): SolidModel {
  const model = new SolidModel('Chain');
  const size = 1 + Math.random();
  for (let index = 0; index < BRUSH_COUNT; index++) {
    const operation = index % 3 === 2 ? SolidOperation.Subtractive : SolidOperation.Additive;
    const instance = model.addBoxBrush(size, operation, null, false);
    model.setBrushTransform(instance.id, new THREE.Vector3(index * size * 0.75, 0, 0));
  }
  model.markDirty();
  model.rebuild();
  return model;
}

/**
 * Finds the solid model a replica holds.
 *
 * @param replica Replica.
 * @returns Solid model.
 */
function replicaModel(replica: ReplicaCollaborationScene): SolidModel {
  for (const child of replica.world.children) {
    const model = SolidModel.fromObject(child);
    if (model !== null) return model;
  }
  throw new Error('replica holds no solid model');
}

/**
 * Creates an owner with the chain and a member synced to it.
 *
 * @returns Room under test.
 */
function roomCreate(): IncrementalRoom {
  const owner = new ReplicaCollaborationScene(new THREE.Group());
  owner.locks.selfSet(1);
  const ownerModel = chainModelBuild();
  owner.world.add(ownerModel.root);
  owner.baselineInitialize();
  const tracker = new TrackerCollaboration(owner, 1 << 24);
  tracker.commit();
  const member = new ReplicaCollaborationScene(new THREE.Group());
  member.locks.selfSet(2);
  member.snapshotApply(JSON.parse(JSON.stringify(owner.snapshotStates())));
  return { ownerModel, memberModel: replicaModel(member), member, tracker };
}

/**
 * Commits the owner's pending edit and applies it on the member.
 *
 * @param room Room under test.
 * @returns Operations sent.
 */
function roomRelay(room: IncrementalRoom): EditOperation[] {
  room.tracker.markDirty();
  const ops = JSON.parse(JSON.stringify(room.tracker.commit().ops)) as EditOperation[];
  room.member.remoteApply(ops);
  return ops;
}

/**
 * Lists the triangles of a compiled solid as sorted rounded text, so buffer
 * layout differences between partial and full rebuilds do not count.
 *
 * @param model Solid model.
 * @returns Sorted triangle descriptions.
 */
function triangleList(model: SolidModel): string[] {
  const geometry = model.mesh.geometry as THREE.BufferGeometry;
  const positions = geometry.getAttribute('position');
  const index = geometry.index;
  const count = index ? index.count : positions.count;
  const triangles: string[] = [];
  for (let corner = 0; corner + 2 < count; corner += 3) {
    const vertices = [0, 1, 2].map((offset) => {
      const vertex = index ? index.getX(corner + offset) : corner + offset;
      return [positions.getX(vertex), positions.getY(vertex), positions.getZ(vertex)]
        .map((value) => (Math.round(value * 1e4) / 1e4 + 0).toFixed(4))
        .join(',');
    });
    triangles.push(vertices.sort().join('|'));
  }
  return triangles.sort();
}

/**
 * Checks the member recompiled no more than the owner did locally and ended
 * with the same geometry as the owner and as its own full rebuild.
 *
 * @param room Room under test.
 */
function memberIncrementalAndExpect(room: IncrementalRoom): void {
  const ownerStats = room.ownerModel.getCompilerStatsForTesting();
  const memberStats = room.memberModel.getCompilerStatsForTesting();
  expect(memberStats.fullRebuild).toBe(false);
  expect(memberStats.recompiledBrushCount).toBeLessThanOrEqual(ownerStats.recompiledBrushCount);
  expect(memberStats.recompiledBrushCount).toBeLessThan(BRUSH_COUNT / 2);
  const memberTriangles = triangleList(room.memberModel);
  expect(memberTriangles).toEqual(triangleList(room.ownerModel));
  room.memberModel.markDirty();
  room.memberModel.rebuild();
  expect(triangleList(room.memberModel)).toEqual(memberTriangles);
}

/**
 * Picks a random brush away from both ends of the chain.
 *
 * @param model Solid model.
 * @returns Brush id.
 */
function brushPickMiddle(model: SolidModel): string {
  const brushes = model.getBrushes();
  const brush = brushes[4 + Math.floor(Math.random() * (brushes.length - 8))];
  if (brush === undefined) throw new Error('chain is too short');
  return brush.id;
}

describe('collaboration incremental CSG rebuild on members', () => {
  it('a remote operation toggle recompiles only the brush and its touch peers', () => {
    const room = roomCreate();
    const brushId = brushPickMiddle(room.ownerModel);
    const brush = room.ownerModel.findBrush(brushId);
    const flipped = brush?.operation === SolidOperation.Additive ? SolidOperation.Subtractive : SolidOperation.Additive;
    room.ownerModel.setBrushOperation(brushId, flipped);
    roomRelay(room);
    expect(room.memberModel.findBrush(brushId)?.operation).toBe(flipped);
    memberIncrementalAndExpect(room);
  });

  it.each<SolidBrushOrderEnd>(['first', 'last'])(
    'a remote move to %s sends one key and recompiles only the moved brush and its touch peers',
    (end) => {
      const room = roomCreate();
      const mesh = room.ownerModel.findBrush(brushPickMiddle(room.ownerModel))?.mesh;
      if (!mesh) throw new Error('brush has no mesh');
      new CommandSolidBrushesReorder([mesh], end).execute();
      const ops = roomRelay(room);
      expect(ops).toHaveLength(1);
      const memberOrder = room.memberModel.getBrushes().map((brush) => brush.id);
      expect(memberOrder).toEqual(room.ownerModel.getBrushes().map((brush) => brush.id));
      memberIncrementalAndExpect(room);
    },
  );
});
