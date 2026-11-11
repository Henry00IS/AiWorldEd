import type { PreparedBrush } from '@/solid/algorithm/compile/solid_compile_types.js';
import type { SolidSurfaceReplayBrush } from './solid_surface_replay_records.js';

/** Holds the replay record of every compiled subject brush, keyed by brush id. */
export class SolidSurfaceReplayStore {
  private readonly recordsByBrushId = new Map<string, SolidSurfaceReplayBrush>();

  /** Forgets every record. */
  clear(): void {
    this.recordsByBrushId.clear();
  }

  /**
   * Drops records of brushes that are no longer compiled.
   *
   * @param keptBrushIds Brush ids that remain.
   */
  pruneToIds(keptBrushIds: ReadonlySet<string>): void {
    for (const brushId of this.recordsByBrushId.keys()) {
      if (!keptBrushIds.has(brushId)) {
        this.recordsByBrushId.delete(brushId);
      }
    }
  }

  /**
   * Returns the previous record of a subject when it was built from the same
   * geometry at the same prepared index.
   *
   * @param subject Subject prepared brush.
   * @param subjectIndex Subject prepared index.
   * @returns Matching record, or null.
   */
  matching(subject: PreparedBrush, subjectIndex: number): SolidSurfaceReplayBrush | null {
    const record = this.recordsByBrushId.get(subject.instance.id);
    if (!record || record.geometry !== subject.brush || record.subjectIndex !== subjectIndex) {
      return null;
    }
    return record;
  }

  /**
   * Stores the record of a subject, replacing the previous one.
   *
   * @param brushId Subject brush id.
   * @param record Record to keep.
   */
  store(brushId: string, record: SolidSurfaceReplayBrush): void {
    this.recordsByBrushId.set(brushId, record);
  }

  /**
   * Starts an empty record for a subject compile, capturing peer geometry.
   *
   * @param prepared Prepared brushes.
   * @param subjectIndex Subject prepared index.
   * @returns New record without faces.
   */
  static createRecord(prepared: readonly PreparedBrush[], subjectIndex: number): SolidSurfaceReplayBrush | null {
    const subject = prepared[subjectIndex];
    if (!subject) {
      return null;
    }
    const peerGeometryByIndex = new Map<number, PreparedBrush['brush']>();
    for (const peerIndex of subject.overlappingPeerIndices) {
      const peer = prepared[peerIndex];
      if (peer) {
        peerGeometryByIndex.set(peerIndex, peer.brush);
      }
    }
    return { geometry: subject.brush, subjectIndex, peerGeometryByIndex, faces: [] };
  }

  /**
   * Lists prepared indices whose peer geometry differs between two records.
   *
   * @param previous Previous record.
   * @param current Current record.
   * @returns Indices of peers that changed, appeared, or disappeared.
   */
  static changedPeerIndices(previous: SolidSurfaceReplayBrush, current: SolidSurfaceReplayBrush): number[] {
    const changed: number[] = [];
    for (const [peerIndex, geometry] of current.peerGeometryByIndex) {
      if (previous.peerGeometryByIndex.get(peerIndex) !== geometry) {
        changed.push(peerIndex);
      }
    }
    for (const peerIndex of previous.peerGeometryByIndex.keys()) {
      if (!current.peerGeometryByIndex.has(peerIndex)) {
        changed.push(peerIndex);
      }
    }
    return changed;
  }
}
