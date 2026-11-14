import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import { SceneDeserializer } from '@/io/scene/scene_deserializer.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { ReplicaCollaborationScene } from '@/collaboration/sync/replica_collaboration_scene.js';
import { TrackerCollaboration } from '@/collaboration/sync/tracker_collaboration_commit.js';
import { CommandObjectPivotSet } from '@/transform/pivot/command_object_pivot_set.js';

const POINT = new THREE.Vector3(1.5, 0.25, -0.75);

/** A moved origin reaches the other members with the geometry left in place. */
describe('pivot edit in a collaboration room', () => {
  it('syncs a brush origin move to the other member', () => {
    const owner = new ReplicaCollaborationScene(worldBuild());
    owner.locks.selfSet(1);
    owner.baselineInitialize();
    const joiner = new ReplicaCollaborationScene(new THREE.Group());
    joiner.locks.selfSet(2);
    joiner.snapshotApply(JSON.parse(JSON.stringify(owner.snapshotStates())));
    const tracker = new TrackerCollaboration(owner, 1 << 20);
    owner.applier.invalidate();
    const ref = owner.applier.nodes().refs.find((candidate) => candidate.kind === 'brush');
    if (ref === undefined) throw new Error('missing brush');
    owner.locks.requestSet([ref.id]);
    const before = worldVertices(modelOf(owner));
    new CommandObjectPivotSet([{ object: ref.object, point: POINT }]).execute();
    const commit = tracker.commit();
    expect(commit.ops.length).toBeGreaterThan(0);
    joiner.remoteApply(JSON.parse(JSON.stringify(commit.ops)));
    const joinerModel = modelOf(joiner);
    const brushMesh = joinerModel.getBrushes()[0]!.mesh!;
    brushMesh.updateWorldMatrix(true, false);
    expect(new THREE.Vector3().setFromMatrixPosition(brushMesh.matrixWorld).distanceTo(POINT)).toBeLessThan(1e-5);
    worldVertices(joinerModel).forEach((vertex, index) => expect(vertex.distanceTo(before[index]!)).toBeLessThan(1e-4));
  });
});

/**
 * Builds a world with one solid model holding an offset brush.
 *
 * @returns World group.
 */
function worldBuild(): THREE.Group {
  const world = new THREE.Group();
  const model = new SolidModel('Solid');
  const brush = model.addBoxBrush(2, SolidOperation.Additive);
  brush.mesh!.position.set(0.5, 0, 0.5);
  brush.mesh!.rotation.y = 0.5;
  brush.pullTransformFromMesh();
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

/**
 * Lists the first brush's vertices in world space.
 *
 * @param model Solid model.
 * @returns World vertices.
 */
function worldVertices(model: SolidModel): THREE.Vector3[] {
  model.root.updateMatrixWorld(true);
  const brush = model.getBrushes()[0]!;
  const matrix = model.root.matrixWorld.clone().multiply(brush.getModelSpaceMatrix());
  return brush.brush.vertices.map((vertex) => vertex.clone().applyMatrix4(matrix));
}
