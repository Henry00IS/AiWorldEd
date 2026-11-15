import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ReplicaCollaborationScene } from '@/collaboration/sync/replica_collaboration_scene.js';
import { TrackerCollaboration } from '@/collaboration/sync/tracker_collaboration_commit.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { getSolidGroupOperation } from '@/solid/model/solid_group.js';
import { CommandStack } from '@/commands/command_stack.js';
import { CommandSolidGroupOperationSet } from '@/solid/commands/group/command_solid_group_operation_set.js';
import type { EditOperation } from '@/collaboration/shared/protocol_definitions.js';
import {
  layoutBox,
  layoutGroup,
  layoutModelBuild,
  meshSignature,
} from '../../solid/algorithm/compile/solid_csg_pass_through_fixture.js';

/** Owner and member replicas holding a wall and a grouped window cutter. */
interface PassThroughRoom {
  ownerModel: SolidModel;
  ownerGroup: THREE.Group;
  memberModel: SolidModel;
  member: ReplicaCollaborationScene;
  tracker: TrackerCollaboration;
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
 * Creates an owner holding a wall and an additive group with a window cutter,
 * plus a member synced to it.
 *
 * @returns Room under test.
 */
function roomCreate(): PassThroughRoom {
  const owner = new ReplicaCollaborationScene(new THREE.Group());
  owner.locks.selfSet(1);
  const { model: ownerModel, groups } = layoutModelBuild('Room', [
    layoutBox([0, 0, 0], [6, 3, 0.5]),
    layoutGroup(SolidOperation.Additive, [layoutBox([0, 0, 0], [1.5, 1.5, 2], SolidOperation.Subtractive)]),
  ]);
  owner.world.add(ownerModel.root);
  owner.baselineInitialize();
  const tracker = new TrackerCollaboration(owner, 1 << 24);
  tracker.commit();
  const member = new ReplicaCollaborationScene(new THREE.Group());
  member.locks.selfSet(2);
  member.snapshotApply(JSON.parse(JSON.stringify(owner.snapshotStates())));
  return { ownerModel, ownerGroup: groups[0]!, memberModel: replicaModel(member), member, tracker };
}

/**
 * Commits the owner's pending edit and applies it on the member.
 *
 * @param room Room under test.
 * @returns Operations sent.
 */
function roomRelay(room: PassThroughRoom): EditOperation[] {
  room.tracker.markDirty();
  const ops = JSON.parse(JSON.stringify(room.tracker.commit().ops)) as EditOperation[];
  room.member.remoteApply(ops);
  return ops;
}

/**
 * Returns the member's copy of the owner's group.
 *
 * @param room Room under test.
 * @returns Member group.
 */
function memberGroup(room: PassThroughRoom): THREE.Object3D {
  const group = room.memberModel.root.getObjectByProperty('uuid', room.ownerGroup.uuid);
  if (!group) throw new Error('member has no copy of the group');
  return group;
}

/**
 * Checks the member holds the given group operation and the owner's mesh, also
 * after its own full rebuild.
 *
 * @param room Room under test.
 * @param operation Expected group operation.
 */
function memberMatchesOwner(room: PassThroughRoom, operation: SolidOperation): void {
  expect(getSolidGroupOperation(memberGroup(room))).toBe(operation);
  const ownerTriangles = meshSignature(room.ownerModel).triangles;
  expect(meshSignature(room.memberModel).triangles).toEqual(ownerTriangles);
  room.memberModel.markDirty();
  room.memberModel.rebuild(true);
  expect(meshSignature(room.memberModel).triangles).toEqual(ownerTriangles);
}

/** Pass-through group operations reach other room members. */
describe('collaboration pass-through group operation', () => {
  it('relays switching a group to pass-through and its undo', () => {
    const room = roomCreate();
    const before = meshSignature(room.ownerModel);
    const stack = new CommandStack(8);
    stack.push(new CommandSolidGroupOperationSet([room.ownerGroup], SolidOperation.PassThrough));
    const ops = roomRelay(room);
    expect(JSON.stringify(ops)).toContain(`"operation":${SolidOperation.PassThrough}`);
    expect(meshSignature(room.ownerModel).volume).toBeLessThan(before.volume - 1);
    memberMatchesOwner(room, SolidOperation.PassThrough);
    stack.undo();
    roomRelay(room);
    memberMatchesOwner(room, SolidOperation.Additive);
    expect(meshSignature(room.memberModel).triangles).toEqual(before.triangles);
  });
});
