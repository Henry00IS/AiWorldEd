import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { SurfaceCategory } from '@/solid/types/surface_category.js';

/** Slots used by one remembered classification in the flat entry list. */
const SOLID_FRAGMENT_MEMO_STRIDE = 3;

/**
 * Remembers how one fragment centroid classified against peer brushes, keyed by
 * prepared index and guarded by the exact peer geometry object. While the memo
 * is being filled for the first time it only appends; once sealed it answers
 * lookups through an index map built on first use. Entries are stored flat as
 * (peer index, peer geometry, category) triples to keep the memo to one list.
 */
export class SolidFragmentClassificationMemo {
  /**
   * Shared list the one memo currently being filled records into. It keeps its
   * capacity between memos, so slots past the active memo may still reference
   * older peer geometry until overwritten.
   */
  private static readonly recordingScratch: (number | SolidBrush)[] = [];
  /** Whether some unsealed memo is recording into the shared list. */
  private static scratchInUse = false;
  private entries: (number | SolidBrush)[];
  /** Used slots of the entry list (the shared list keeps its capacity). */
  private entryCount = 0;
  private usesScratch: boolean;
  private entryByPeerIndex: Map<number, number> | null = null;
  private sealed = false;

  /**
   * Creates an empty memo. While no other memo is being filled it records into
   * a shared list and takes an exactly sized copy when sealed, so filling
   * allocates no growing arrays; otherwise it records into its own list.
   */
  constructor() {
    const scratch = SolidFragmentClassificationMemo.recordingScratch;
    this.usesScratch = !SolidFragmentClassificationMemo.scratchInUse;
    if (this.usesScratch) {
      SolidFragmentClassificationMemo.scratchInUse = true;
      this.entries = scratch;
    } else {
      this.entries = [];
    }
  }

  /** Switches the memo from first-time filling to answering lookups. */
  seal(): void {
    if (this.usesScratch) {
      this.entries = this.entries.slice(0, this.entryCount);
      SolidFragmentClassificationMemo.scratchInUse = false;
      this.usesScratch = false;
    }
    this.sealed = true;
  }

  /**
   * Returns the remembered category for a peer when it was classified against
   * the same geometry object.
   *
   * @param peerIndex Prepared index of the peer.
   * @param peerGeometry Current geometry of the peer.
   * @returns Remembered category, or undefined when unknown, stale, or the memo
   *   is not sealed yet.
   */
  categoryFor(peerIndex: number, peerGeometry: SolidBrush): SurfaceCategory | undefined {
    if (!this.sealed) {
      return undefined;
    }
    const slot = this.slotOf(peerIndex);
    if (slot < 0 || this.entries[slot + 1] !== peerGeometry) {
      return undefined;
    }
    return this.entries[slot + 2] as SurfaceCategory;
  }

  /**
   * Records a classification, replacing an earlier one for the same peer.
   *
   * @param peerIndex Prepared index of the peer.
   * @param peerGeometry Geometry the classification was made against.
   * @param category Classification result.
   */
  remember(peerIndex: number, peerGeometry: SolidBrush, category: SurfaceCategory): void {
    const existing = this.sealed ? this.slotOf(peerIndex) : -1;
    if (existing >= 0) {
      this.entries[existing + 1] = peerGeometry;
      this.entries[existing + 2] = category;
      return;
    }
    const slot = this.entryCount;
    this.entryByPeerIndex?.set(peerIndex, slot);
    this.entries[slot] = peerIndex;
    this.entries[slot + 1] = peerGeometry;
    this.entries[slot + 2] = category;
    this.entryCount = slot + SOLID_FRAGMENT_MEMO_STRIDE;
  }

  /**
   * Returns whether any of the given peers was consulted.
   *
   * @param peerIndices Prepared indices to look for.
   * @returns True when at least one of them has an entry.
   */
  consultedAny(peerIndices: readonly number[]): boolean {
    for (const peerIndex of peerIndices) {
      if (this.slotOf(peerIndex) >= 0) {
        return true;
      }
    }
    return false;
  }

  /**
   * Returns the first slot of a peer's entry, building the index map lazily.
   *
   * @param peerIndex Prepared index of the peer.
   * @returns Slot index, or -1 when the peer has no entry.
   */
  private slotOf(peerIndex: number): number {
    if (!this.entryByPeerIndex) {
      this.entryByPeerIndex = new Map();
      for (let slot = 0; slot < this.entryCount; slot += SOLID_FRAGMENT_MEMO_STRIDE) {
        this.entryByPeerIndex.set(this.entries[slot] as number, slot);
      }
    }
    return this.entryByPeerIndex.get(peerIndex) ?? -1;
  }
}
