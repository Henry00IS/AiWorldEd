import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import { SceneDeserializer } from '@/io/scene/scene_deserializer.js';
import { ToolPrimitiveCreation } from '@/tools/creation/tool_primitive_creation.js';
import { ReplicaCollaborationScene } from '@/collaboration/sync/replica_collaboration_scene.js';
import { TrackerCollaboration } from '@/collaboration/sync/tracker_collaboration_commit.js';
import { LiveCollaborationTicker } from '@/collaboration/sync/live_collaboration_ticker.js';
import type { EditOperation } from '@/collaboration/shared/protocol_definitions.js';
import { ensureMeshEditDocument } from '@/edit/mesh/mesh_edit_binding.js';
import { writeMeshDocumentDisplayGeometry } from '@/mesh/convert/mesh_document_display_write.js';

/**
 * Builds an owner replica holding one box made by the creation tool.
 *
 * @returns Replica, its box and the box wire id.
 */
function ownerBuild(): { replica: ReplicaCollaborationScene; box: THREE.Mesh; id: string } {
  const world = new THREE.Group();
  const box = new ToolPrimitiveCreation(world).createBox(1, 1, 1);
  box.name = 'Box';
  world.add(box);
  const normalized = new THREE.Group();
  new SceneDeserializer().deserialize(new SceneSerializer().serialize(world), normalized);
  const replica = new ReplicaCollaborationScene(normalized);
  replica.locks.selfSet(1);
  replica.baselineInitialize();
  const ref = replica.applier.nodes().refs.find((candidate) => candidate.object.name === 'Box');
  if (ref === undefined || !(ref.object instanceof THREE.Mesh)) throw new Error('missing Box');
  replica.locks.requestSet([ref.id]);
  return { replica, box: ref.object, id: ref.id };
}

describe('live collaboration after a redraw that changes nothing', () => {
  it('streams no live shape once a commit found the redrawn mesh unchanged', () => {
    const { replica, box } = ownerBuild();
    const tracker = new TrackerCollaboration(replica, 1 << 20);
    const ticker = new LiveCollaborationTicker(replica, tracker, () => ({ positionLock: true, stretchLock: false }));
    const redrawn = box.geometry.clone();
    redrawn.getAttribute('position').needsUpdate = true;
    box.geometry = redrawn;
    replica.applier.invalidate();
    expect(tracker.commit().ops).toEqual([]);
    ticker.reset();
    const ops = [1000, 1300, 1600].flatMap((now) => {
      replica.applier.invalidate();
      return ticker.collect(16, now);
    });
    expect(ops).toEqual([]);
  });
});

describe('live collaboration of a folding Edit Mode vertex move', () => {
  it('lets the peer take the committed shape and a later undo of it', () => {
    const { replica: owner, box, id } = ownerBuild();
    const document = ensureMeshEditDocument(box);
    if (document === null) throw new Error('box without document');
    owner.applier.invalidate();
    new TrackerCollaboration(owner, 1 << 20).commit();
    const peer = new ReplicaCollaborationScene(new THREE.Group());
    peer.locks.selfSet(2);
    peer.snapshotApply(JSON.parse(JSON.stringify(owner.snapshotStates())));
    const tracker = new TrackerCollaboration(owner, 1 << 20);
    const ticker = new LiveCollaborationTicker(owner, tracker, () => ({ positionLock: true, stretchLock: false }));
    const relay = (ops: readonly EditOperation[]): void => {
      const copy = JSON.parse(JSON.stringify(ops)) as EditOperation[];
      peer.remoteApply(copy);
      owner.remoteApply(JSON.parse(JSON.stringify(ops)) as EditOperation[]);
    };
    const start = document.getTopology().getPositions()[0] ?? 0;
    const cornerSet = (x: number): void => {
      const positions = document.getTopology().getPositions().slice();
      positions[0] = x;
      document.getTopology().setPositions(positions);
      writeMeshDocumentDisplayGeometry(box, document);
      owner.applier.invalidate();
    };
    const peerText = (): string | undefined => peer.baselines.get(id)?.text;
    cornerSet(start + 2);
    relay(ticker.collect(16, 1000));
    relay(tracker.commit().ops);
    ticker.reset();
    expect(peerText()).toBe(owner.baselines.get(id)?.text);
    cornerSet(start);
    relay(tracker.commit().ops);
    expect(peerText()).toBe(owner.baselines.get(id)?.text);
    peer.applier.invalidate();
    const shown = peer.applier.nodes().get(id)?.object;
    if (!(shown instanceof THREE.Mesh)) throw new Error('missing Box on the peer');
    expect(new THREE.Box3().setFromBufferAttribute(shown.geometry.getAttribute('position')).min.x).toBeCloseTo(start);
  });
});
