import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ReplicaCollaborationScene } from '@/collaboration/sync/replica_collaboration_scene.js';
import { TrackerCollaboration } from '@/collaboration/sync/tracker_collaboration_commit.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';
import { modifierVolumeTemplateCreate } from '@/modifier/stack/modifier_volume_templates.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import type { NodeCollaborationPose } from '@/collaboration/scene/node_collaboration_applier.js';

/**
 * Returns a compiled model's vertex positions, independent of object identity.
 *
 * @param model Compiled model.
 * @returns Vertex positions.
 */
function positions(model: SolidModel): number[] {
  return Array.from(model.mesh.geometry.getAttribute('position').array);
}

/**
 * Builds two replicas containing a standalone generator.
 *
 * @param kind Generator kind.
 * @returns Replicas, tracker, generator and compiled models.
 */
function pair(kind: string) {
  const owner = new ReplicaCollaborationScene(new THREE.Group());
  owner.locks.selfSet(1);
  const model = new SolidModel('Resize');
  const node = kind === 'linear' ? modifierVolumeTemplateCreate(kind) : modifierGeneratorNodeCreate(kind);
  if (kind === 'linear') model.addBoxBrush(1, SolidOperation.Additive);
  model.root.add(node);
  owner.world.add(model.root);
  modifierBevelRefreshScene(owner.world);
  owner.baselineInitialize();
  const remote = new ReplicaCollaborationScene(new THREE.Group());
  remote.locks.selfSet(2);
  remote.snapshotApply(JSON.parse(JSON.stringify(owner.snapshotStates())));
  const object = remote.applier.nodes().get(model.root.uuid)?.object;
  const remoteModel = object ? SolidModel.fromObject(object) : null;
  if (!remoteModel) throw new Error('Missing remote solid');
  return { owner, remote, node, model, remoteModel, tracker: new TrackerCollaboration(owner, 1 << 24) };
}

describe('remote generator resizing', () => {
  it.each(['arch', 'column', 'stairs'])('rebuilds %s during live scaling and after the settled commit', (kind) => {
    const { owner, remote, node, model, remoteModel, tracker } = pair(kind);
    const original = positions(remoteModel);
    node.scale.multiplyScalar(1.5);
    modifierBevelRefreshScene(owner.world);
    const pose: NodeCollaborationPose = [
      ...node.position.toArray(),
      ...node.quaternion.toArray(),
      ...node.scale.toArray(),
    ];
    remote.remoteApply([{ k: 'transform', ids: [node.uuid], d: { live: 1, t: pose } }]);
    expect(positions(remoteModel)).not.toEqual(original);
    expect(positions(remoteModel)).toEqual(positions(model));
    remote.remoteApply(JSON.parse(JSON.stringify(tracker.commit().ops)));
    expect(positions(remoteModel)).toEqual(positions(model));
  });
  it.each(['arch', 'column', 'stairs'])('rebuilds %s from a live full-state resize', (kind) => {
    const { owner, remote, node, model, remoteModel } = pair(kind);
    const original = positions(remoteModel);
    node.scale.multiplyScalar(1.25);
    modifierBevelRefreshScene(owner.world);
    const ref = owner.applier.nodes().get(node.uuid);
    if (!ref) throw new Error('Missing generator');
    const state = owner.codec.encode(ref, model.root.uuid, owner.keyOf(node.uuid) ?? '');
    if (!state) throw new Error('Missing generator state');
    remote.remoteApply([{ k: 'transform', ids: [node.uuid], d: { live: 1, s: state } }]);
    expect(positions(remoteModel)).not.toEqual(original);
    expect(positions(remoteModel)).toEqual(positions(model));
  });

  it('re-evaluates a volume during live movement and restores its cancelled preview', () => {
    const { remote, node, remoteModel } = pair('linear');
    const original = positions(remoteModel);
    const pose: NodeCollaborationPose = [30, 0, 0, 0, 0, 0, 1, ...node.scale.toArray()];
    remote.remoteApply([{ k: 'transform', ids: [node.uuid], d: { live: 1, t: pose } }]);
    expect(positions(remoteModel)).not.toEqual(original);
    remote.previewRestore([node.uuid]);
    expect(positions(remoteModel)).toEqual(original);
  });

  it('rebuilds generator output when its container scales during a preview', () => {
    const { owner, remote, model, remoteModel } = pair('arch');
    model.root.scale.multiplyScalar(1.5);
    modifierBevelRefreshScene(owner.world);
    const pose: NodeCollaborationPose = [0, 0, 0, 0, 0, 0, 1, ...model.root.scale.toArray()];
    remote.remoteApply([{ k: 'transform', ids: [model.root.uuid], d: { live: 1, t: pose } }]);
    expect(positions(remoteModel)).toEqual(positions(model));
    expect(remoteModel.root.scale.toArray()).toEqual(model.root.scale.toArray());
  });
});
