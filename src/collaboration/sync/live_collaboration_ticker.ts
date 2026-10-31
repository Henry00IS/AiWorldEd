import type * as THREE from 'three';
import { nodeFingerprintPose } from '@/collaboration/scene/node_collaboration_fingerprint.js';
import type { NodeCollaborationPose } from '@/collaboration/scene/node_collaboration_applier.js';
import type { ReplicaCollaborationScene } from '@/collaboration/sync/replica_collaboration_scene.js';
import type { TrackerCollaboration } from '@/collaboration/sync/tracker_collaboration_commit.js';
import type { EditOperation } from '@/collaboration/shared/protocol_definitions.js';

/** Interval between live transform broadcasts (about 30 Hz). */
export const LIVE_COLLABORATION_INTERVAL_MS = 33;

/**
 * Streams interactive transforms of held nodes while they move, before the
 * final state is committed. Only poses of nodes the local user requested are
 * inspected, so the cost scales with the selection, not the scene.
 */
export class LiveCollaborationTicker {
  private readonly replica: ReplicaCollaborationScene;
  private readonly tracker: TrackerCollaboration;
  private readonly sent: Map<string, string>;

  /**
   * Creates a live ticker.
   *
   * @param replica Scene replica.
   * @param tracker Commit tracker whose history base records pre-drag states.
   */
  constructor(replica: ReplicaCollaborationScene, tracker: TrackerCollaboration) {
    this.replica = replica;
    this.tracker = tracker;
    this.sent = new Map();
  }

  /**
   * Collects live transform operations for held nodes whose pose changed since
   * the last broadcast or commit.
   *
   * @param limit Maximum operations to return.
   * @returns Live transform operations.
   */
  collect(limit: number): EditOperation[] {
    const ops: EditOperation[] = [];
    const nodes = this.replica.applier.nodes();
    for (const id of this.replica.locks.requestedIds()) {
      if (ops.length >= limit) break;
      const baseline = this.replica.baselines.get(id);
      const ref = nodes.get(id);
      if (baseline === undefined || ref === undefined || ref.object.parent === null) continue;
      const pose = nodeFingerprintPose(ref.object);
      if (pose === (this.sent.get(id) ?? this.replica.poses.get(id))) continue;
      if (!this.tracker.historyBase.has(id)) this.tracker.historyBase.set(id, baseline.state);
      this.sent.set(id, pose);
      ops.push({ k: 'transform', ids: [id], d: { live: 1, t: livePosePack(ref.object) } });
    }
    return ops;
  }

  /** Forgets broadcast poses after a commit made them part of the baseline. */
  reset(): void {
    this.sent.clear();
  }
}

/**
 * Packs the local transform of an object.
 *
 * @param object Scene object.
 * @returns Position, quaternion and scale.
 */
export function livePosePack(object: THREE.Object3D): NodeCollaborationPose {
  const p = object.position;
  const q = object.quaternion;
  const s = object.scale;
  return [p.x, p.y, p.z, q.x, q.y, q.z, q.w, s.x, s.y, s.z];
}
