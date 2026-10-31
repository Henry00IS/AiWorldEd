import { codecStateText } from '@/collaboration/scene/node_collaboration_codec.js';
import type { NodeCollaborationState } from '@/collaboration/scene/node_collaboration_types.js';
import { historyCollaborationOrder } from '@/collaboration/sync/history_collaboration_apply.js';
import type { HistoryCollaborationEntry } from '@/collaboration/sync/history_collaboration_stack.js';
import type { ReplicaCollaborationScene } from '@/collaboration/sync/replica_collaboration_scene.js';
import type { TrackerCollaborationChange } from '@/collaboration/sync/tracker_collaboration_commit.js';
import type { EditOperation } from '@/collaboration/shared/protocol_definitions.js';

/** Edit message sent to the relay. */
export interface EditCollaborationMessage {
  t: 'edit';
  seq: number;
  ops: EditOperation[];
}

/** Sent edit awaiting acknowledgement. */
export interface EditCollaborationPending {
  seq: number;
  changes: TrackerCollaborationChange[];
  entry: HistoryCollaborationEntry | null;
}

/** Default JSON budget of one edit message, below the relay payload limit. */
export const EDIT_COLLABORATION_BYTES_DEFAULT = 800 * 1024;

/**
 * Numbers outgoing edits, splits them to fit relay limits, and remembers the
 * changes of each edit until the relay acknowledges or rejects it.
 */
export class EditCollaborationOutbox {
  private readonly opsPerEdit: number;
  private readonly bytesPerEdit: number;
  private readonly pending: Map<number, EditCollaborationPending>;
  private sequence: number;

  /**
   * Creates an outbox.
   *
   * @param opsPerEdit Maximum operations per message.
   * @param bytesPerEdit Maximum JSON size of the operations per message.
   */
  constructor(opsPerEdit: number, bytesPerEdit: number = EDIT_COLLABORATION_BYTES_DEFAULT) {
    this.opsPerEdit = Math.max(1, opsPerEdit);
    this.bytesPerEdit = bytesPerEdit;
    this.pending = new Map();
    this.sequence = 0;
  }

  /**
   * Builds the messages of one edit and records them as pending.
   *
   * @param ops Operations in order.
   * @param changes Node changes behind the operations (empty for live poses).
   * @param entry History entry of the edit, or null.
   * @returns Edit messages to send in order.
   */
  build(
    ops: readonly EditOperation[],
    changes: readonly TrackerCollaborationChange[],
    entry: HistoryCollaborationEntry | null,
  ): EditCollaborationMessage[] {
    return editCollaborationSplit(ops, this.opsPerEdit, this.bytesPerEdit).map((chunk) => {
      this.sequence += 1;
      const ids = new Set(chunk.flatMap((op) => op.ids));
      const chunkChanges = changes.filter((change) => ids.has(change.id));
      if (chunkChanges.length > 0)
        this.pending.set(this.sequence, { seq: this.sequence, changes: chunkChanges, entry });
      return { t: 'edit', seq: this.sequence, ops: chunk };
    });
  }

  /**
   * Returns the sequence number of the last built message.
   *
   * @returns Last sequence number.
   */
  lastSequence(): number {
    return this.sequence;
  }

  /**
   * Forgets pending edits up to a sequence number after the relay processed
   * them.
   *
   * @param sequence Highest acknowledged sequence number.
   */
  acknowledge(sequence: number): void {
    this.pending.forEach((_pending, seq) => {
      if (seq <= sequence) this.pending.delete(seq);
    });
  }

  /**
   * Removes and returns a rejected edit.
   *
   * @param sequence Rejected sequence number.
   * @returns Pending edit, or undefined for live or unknown edits.
   */
  reject(sequence: number): EditCollaborationPending | undefined {
    const pending = this.pending.get(sequence);
    this.pending.delete(sequence);
    return pending;
  }

  /**
   * Returns the number of edits awaiting acknowledgement.
   *
   * @returns Pending count.
   */
  pendingCount(): number {
    return this.pending.size;
  }

  /** Forgets every pending edit. */
  clear(): void {
    this.pending.clear();
  }
}

/**
 * Splits operations into chunks within an operation count and JSON size.
 *
 * @param ops Operations in order.
 * @param maxOps Maximum operations per chunk.
 * @param maxBytes Maximum JSON length per chunk.
 * @returns Chunks in order.
 */
export function editCollaborationSplit(
  ops: readonly EditOperation[],
  maxOps: number,
  maxBytes: number,
): EditOperation[][] {
  const chunks: EditOperation[][] = [];
  let current: EditOperation[] = [];
  let bytes = 0;
  ops.forEach((op) => {
    const size = JSON.stringify(op).length + 1;
    if (current.length > 0 && (current.length >= maxOps || bytes + size > maxBytes)) {
      chunks.push(current);
      current = [];
      bytes = 0;
    }
    current.push(op);
    bytes += size;
  });
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * Restores the before states of rejected changes that no later edit replaced.
 *
 * @param replica Scene replica.
 * @param changes Rejected changes.
 * @returns Ids changed locally.
 */
export function editCollaborationRevert(
  replica: ReplicaCollaborationScene,
  changes: readonly TrackerCollaborationChange[],
): Set<string> {
  const upserts: NodeCollaborationState[] = [];
  const deletes: string[] = [];
  changes.forEach((change) => {
    const text = replica.baselines.get(change.id)?.text ?? null;
    if (text !== (change.after === null ? null : codecStateText(change.after))) return;
    if (change.before !== null) upserts.push(change.before);
    else deletes.push(change.id);
  });
  if (upserts.length === 0 && deletes.length === 0) return new Set();
  return replica.statesApply(historyCollaborationOrder(upserts), deletes, new Map(), false, 'local');
}
