import * as THREE from 'three';
import { nodeFingerprint, nodeFingerprintPose } from '@/collaboration/scene/node_collaboration_fingerprint.js';
import type { NodeCollaborationPose } from '@/collaboration/scene/node_collaboration_applier.js';
import { codecStateText } from '@/collaboration/scene/node_collaboration_codec.js';
import type {
  NodeCollaborationBaseline,
  NodeCollaborationRef,
} from '@/collaboration/scene/node_collaboration_types.js';
import type { ReplicaCollaborationScene } from '@/collaboration/sync/replica_collaboration_scene.js';
import {
  TRACKER_HEAVY_VERTEX_COUNT,
  type TrackerCollaboration,
} from '@/collaboration/sync/tracker_collaboration_commit.js';
import type { EditOperation } from '@/collaboration/shared/protocol_definitions.js';

/** Interval between live transform broadcasts (about 30 Hz). */
export const LIVE_COLLABORATION_INTERVAL_MS = 33;

/** Interval between live geometry broadcasts of edit-mode drags (10 Hz). */
export const LIVE_COLLABORATION_SHAPE_MS = 100;

/** Largest encoded state streamed live; bigger shapes wait for the commit. */
export const LIVE_COLLABORATION_SHAPE_BYTES = 256 * 1024;

/**
 * Streams interactive transforms of selected nodes while they move, and the
 * geometry of brushes and meshes reshaped in edit mode, before the final state
 * is committed. Only the selection's subtrees (and created nodes) are
 * inspected, so the cost scales with the selection, not the scene.
 */
export class LiveCollaborationTicker {
  private readonly replica: ReplicaCollaborationScene;
  private readonly tracker: TrackerCollaboration;
  private readonly sent: Map<string, string>;
  private readonly shapes: Map<string, string>;
  private shapeAt: number;

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
    this.shapes = new Map();
    this.shapeAt = 0;
  }

  /**
   * Collects live operations for held nodes whose pose or edit-mode geometry
   * changed since the last broadcast or commit.
   *
   * @param limit Maximum operations to return.
   * @param now Current time in milliseconds.
   * @returns Live operations.
   */
  collect(limit: number, now: number = Date.now()): EditOperation[] {
    const ops: EditOperation[] = [];
    const nodes = this.replica.applier.nodes();
    const shaping = now - this.shapeAt >= LIVE_COLLABORATION_SHAPE_MS;
    for (const id of this.replica.locks.requestedIds()) {
      if (ops.length >= limit) break;
      if (!this.replica.mine(id)) continue;
      const baseline = this.replica.baselines.get(id);
      const ref = nodes.get(id);
      if (baseline === undefined || ref === undefined || ref.object.parent === null) continue;
      const op = (shaping ? this.shapeOp(ref, baseline) : null) ?? this.poseOp(ref, baseline);
      if (op !== null) ops.push(op);
    }
    if (shaping && ops.some((op) => (op.d as { s?: unknown }).s !== undefined)) this.shapeAt = now;
    return ops;
  }

  /**
   * Returns the ids whose pose or geometry was streamed since the last commit.
   *
   * @returns Ids.
   */
  streamedIds(): string[] {
    return [...new Set([...this.sent.keys(), ...this.shapes.keys()])];
  }

  /**
   * Forgets that changes of some nodes went out (they were not sent because the
   * operation has no lease yet), so the next tick offers them again.
   *
   * @param ids Wire ids.
   */
  unsend(ids: Iterable<string>): void {
    for (const id of ids) {
      this.sent.delete(id);
      this.shapes.delete(id);
    }
  }

  /** Forgets broadcast poses and shapes after a commit made them agreed. */
  reset(): void {
    this.sent.clear();
    this.shapes.clear();
  }

  /**
   * Builds a live pose operation when the node moved.
   *
   * @param ref Held node.
   * @param baseline Agreed baseline.
   * @returns Operation, or null when the pose is unchanged.
   */
  private poseOp(ref: NodeCollaborationRef, baseline: NodeCollaborationBaseline): EditOperation | null {
    const pose = nodeFingerprintPose(ref.object);
    if (pose === (this.sent.get(ref.id) ?? this.replica.poses.get(ref.id))) return null;
    this.baseRecord(ref.id, baseline);
    this.sent.set(ref.id, pose);
    return { k: 'transform', ids: [ref.id], d: { live: 1, t: livePosePack(ref.object) } };
  }

  /**
   * Builds a live state operation when an edit-mode drag reshaped a held brush
   * or mesh. Pose changes alone never qualify; they stream as poses.
   *
   * @param ref Held node.
   * @param baseline Agreed baseline.
   * @returns Operation, or null when the geometry is unchanged.
   */
  private shapeOp(ref: NodeCollaborationRef, baseline: NodeCollaborationBaseline): EditOperation | null {
    if (!liveShaped(ref)) return null;
    const parent = baseline.state.parent;
    const print = nodeFingerprint(ref, parent).replace(nodeFingerprintPose(ref.object), '');
    const agreed = baseline.fingerprint.replace(this.replica.poses.get(ref.id) ?? '', '');
    if (print === (this.shapes.get(ref.id) ?? agreed)) return null;
    const state = this.replica.codec.encode(ref, parent, baseline.state.key);
    if (state === null || codecStateText(state).length > LIVE_COLLABORATION_SHAPE_BYTES) return null;
    this.baseRecord(ref.id, baseline);
    this.shapes.set(ref.id, print);
    this.sent.set(ref.id, nodeFingerprintPose(ref.object));
    return { k: 'transform', ids: [ref.id], d: { live: 1, s: state } };
  }

  /**
   * Remembers the pre-drag state as the undo base of a node.
   *
   * @param id Wire id.
   * @param baseline Agreed baseline.
   */
  private baseRecord(id: string, baseline: NodeCollaborationBaseline): void {
    if (!this.tracker.historyBase.has(id)) this.tracker.historyBase.set(id, baseline.state);
  }
}

/**
 * Returns whether a node's geometry may stream live: solid brushes and plain
 * meshes small enough for the tracker to encode on every commit.
 *
 * @param ref Node.
 * @returns True when streamable.
 */
function liveShaped(ref: NodeCollaborationRef): boolean {
  const object = ref.object;
  if (!(object instanceof THREE.Mesh) || (ref.kind !== 'brush' && ref.model !== null)) return false;
  const position = (object.geometry as THREE.BufferGeometry).getAttribute('position');
  return position === undefined || position.count <= TRACKER_HEAVY_VERTEX_COUNT;
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
