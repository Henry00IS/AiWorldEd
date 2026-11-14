import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import { SceneDeserializer } from '@/io/scene/scene_deserializer.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { ReplicaCollaborationScene } from '@/collaboration/sync/replica_collaboration_scene.js';
import { TrackerCollaboration } from '@/collaboration/sync/tracker_collaboration_commit.js';
import { CommandTextureSolidFaceAssign } from '@/texture/commands/command_texture_solid_face_assign.js';

const TEXTURE_ID = 'folder/bricks.png';

/**
 * A texture dropped on a face of a brush nobody selected is a one-shot edit:
 * the edit gate touches the brush, so the painted face reaches the other
 * members.
 */
describe('texture drop in a collaboration room', () => {
  it('syncs the painted face of an unselected brush to the other member', () => {
    const owner = new ReplicaCollaborationScene(worldBuild());
    owner.locks.selfSet(1);
    owner.baselineInitialize();
    const joiner = new ReplicaCollaborationScene(new THREE.Group());
    joiner.locks.selfSet(2);
    joiner.snapshotApply(JSON.parse(JSON.stringify(owner.snapshotStates())));
    const tracker = new TrackerCollaboration(owner, 1 << 20);
    owner.applier.invalidate();
    const brushRef = owner.applier.nodes().refs.find((ref) => ref.kind === 'brush');
    if (brushRef === undefined) throw new Error('missing brush');
    tracker.touch([brushRef.id]);
    const model = modelOf(owner);
    const brush = model.getBrushes()[0]!;
    new CommandTextureSolidFaceAssign([{ model, brushId: brush.id, surfaceIndex: 2 }], TEXTURE_ID).execute();
    const commit = tracker.commit();
    expect(commit.ops.length).toBeGreaterThan(0);
    joiner.remoteApply(JSON.parse(JSON.stringify(commit.ops)));
    const joinerBrush = modelOf(joiner).getBrushes()[0]!;
    expect(joinerBrush.getSurfaceTextureId(2)).toBe(TEXTURE_ID);
    expect(joinerBrush.getSurfaceTextureId(1)).toBe(brush.getSurfaceTextureId(1));
  });
});

/**
 * Builds a world with one solid model, normalized through save and load.
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

/**
 * Finds the solid model of a replica.
 *
 * @param replica Replica.
 * @returns Solid model.
 */
function modelOf(replica: ReplicaCollaborationScene): SolidModel {
  replica.applier.invalidate();
  const ref = replica.applier.nodes().refs.find((candidate) => candidate.object.name === 'Solid');
  const model = ref === undefined ? null : SolidModel.fromObject(ref.object);
  if (model == null) throw new Error('missing model');
  return model;
}
