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
import type { TextureLockFlags } from '@/texture/lock/texture_lock_transform.js';

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
  private readonly textureLocks: () => TextureLockFlags | null;
  private shapeAt: number;

  /**
   * Creates a live ticker.
   *
   * @param replica Scene replica.
   * @param tracker Commit tracker whose history base records pre-drag states.
   * @param textureLocks Returns the texture locks of the running transform,
   *   sent with live brush poses.
   */
  constructor(
    replica: ReplicaCollaborationScene,
    tracker: TrackerCollaboration,
    textureLocks: () => TextureLockFlags | null = () => null,
  ) {
    this.replica = replica;
    this.tracker = tracker;
    this.textureLocks = textureLocks;
    this.sent = new Map();
    this.shapes = new Map();
    this.shapeAt = 0;
  }

  /**
   * Collects live operations for held nodes whose pose or edit-mode geometry
   * changed since the last broadcast or commit.
   *
   * Nodes another member is editing are skipped unless `foreign` is set (the
   * user is pressing a pointer): then a pose the user changed (it differs from
   * the one this replica last wrote) is reported too, so the operation asks for
   * its lease and is refused at once instead of previewing silently.
   *
   * @param limit Maximum operations to return.
   * @param now Current time in milliseconds.
   * @param foreign True to report own changes of nodes another member edits.
   * @returns Live operations.
   */
  collect(limit: number, now: number = Date.now(), foreign: boolean = false): EditOperation[] {
    const ops: EditOperation[] = [];
    const nodes = this.replica.applier.nodes();
    const shaping = now - this.shapeAt >= LIVE_COLLABORATION_SHAPE_MS;
    for (const id of this.replica.locks.requestedIds()) {
      if (ops.length >= limit) break;
      const baseline = this.replica.baselines.get(id);
      const ref = nodes.get(id);
      if (baseline === undefined || ref === undefined || ref.object.parent === null) continue;
      if (!this.replica.mine(id)) {
        if (foreign && this.foreignMoved(ref))
          ops.push({ k: 'transform', ids: [id], d: { live: 1, t: livePosePack(ref.object) } });
        continue;
      }
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
   * Returns whether the user moved a node another member is editing: its pose
   * differs from the one this replica last wrote into the scene.
   *
   * @param ref Node.
   * @returns True when moved locally.
   */
  private foreignMoved(ref: NodeCollaborationRef): boolean {
    const shown = this.replica.shown.get(ref.id) ?? this.replica.poses.get(ref.id);
    return shown !== undefined && nodeFingerprintPose(ref.object) !== shown;
  }

  /**
   * Builds a live pose operation when the node moved. Brush poses carry the
   * texture lock bits of the running transform when any lock is off.
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
    const d: Record<string, unknown> = { live: 1, t: livePosePack(ref.object) };
    const locks = ref.kind === 'brush' ? liveLocksPack(this.textureLocks()) : null;
    if (locks !== null) d['l'] = locks;
    return { k: 'transform', ids: [ref.id], d };
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
 * Packs the texture locks of a live brush pose as `[positionLock, stretchLock]`
 * bits. Both locks on keep brush-local UVs unchanged, which is what a pose
 * without locks already means, so that case sends nothing.
 *
 * @param locks Texture locks of the running transform, or null.
 * @returns Lock bits, or null when receivers need no UV rewrite.
 */
export function liveLocksPack(locks: TextureLockFlags | null): [number, number] | null {
  if (locks === null || (locks.positionLock && locks.stretchLock)) return null;
  return [locks.positionLock ? 1 : 0, locks.stretchLock ? 1 : 0];
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
