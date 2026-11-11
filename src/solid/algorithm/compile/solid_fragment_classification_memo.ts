import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { SurfaceCategory } from '@/solid/types/surface_category.js';

/**
 * Remembers how one fragment centroid classified against peer brushes, keyed by
 * prepared index and guarded by the exact peer geometry object. While the memo
 * is being filled for the first time it only appends; once sealed it answers
 * lookups through an index map built on first use.
 */
export class SolidFragmentClassificationMemo {
  private readonly peerIndices: number[] = [];
  private readonly peerGeometries: SolidBrush[] = [];
  private readonly categories: SurfaceCategory[] = [];
  private entryByPeerIndex: Map<number, number> | null = null;
  private sealed = false;

  /** Switches the memo from first-time filling to answering lookups. */
  seal(): void {
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
    const entry = this.entryIndexOf(peerIndex);
    if (entry < 0 || this.peerGeometries[entry] !== peerGeometry) {
      return undefined;
    }
    return this.categories[entry];
  }

  /**
   * Stores the category of a peer classification.
   *
   * @param peerIndex Prepared index of the peer.
   * @param peerGeometry Geometry the centroid was classified against.
   * @param category Resulting category.
   */
  remember(peerIndex: number, peerGeometry: SolidBrush, category: SurfaceCategory): void {
    const existing = this.sealed ? this.entryIndexOf(peerIndex) : -1;
    if (existing >= 0) {
      this.peerGeometries[existing] = peerGeometry;
      this.categories[existing] = category;
      return;
    }
    this.entryByPeerIndex?.set(peerIndex, this.peerIndices.length);
    this.peerIndices.push(peerIndex);
    this.peerGeometries.push(peerGeometry);
    this.categories.push(category);
  }

  /**
   * Returns whether any of the given peers was consulted for this fragment.
   *
   * @param peerIndices Prepared indices to test.
   * @returns True when at least one of them has a remembered classification.
   */
  consultedAny(peerIndices: readonly number[]): boolean {
    for (const peerIndex of peerIndices) {
      if (this.entryIndexOf(peerIndex) >= 0) {
        return true;
      }
    }
    return false;
  }

  /**
   * Returns the entry position of a peer index, building the index map lazily.
   *
   * @param peerIndex Prepared index of the peer.
   * @returns Entry position, or -1 when the peer was never consulted.
   */
  private entryIndexOf(peerIndex: number): number {
    if (!this.entryByPeerIndex) {
      this.entryByPeerIndex = new Map();
      for (let entry = 0; entry < this.peerIndices.length; entry++) {
        this.entryByPeerIndex.set(this.peerIndices[entry] ?? -1, entry);
      }
    }
    return this.entryByPeerIndex.get(peerIndex) ?? -1;
  }
}
