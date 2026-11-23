/** Edges baked from the hull triangles of one brush shape. */
export interface SolidBrushEdgeHullEntry {
  /** Hull triangle positions the edges were baked from. */
  readonly hull: Float32Array;
  /** Edge segment positions, or null when the hull has no edges. */
  readonly edges: Float32Array | null;
}

/**
 * Hashes the exact bits of hull positions.
 *
 * @param bits Positions as their 32-bit patterns.
 * @returns Hash.
 */
function solidBrushEdgeHullHash(bits: Uint32Array): number {
  let hash = 0x811c9dc5 ^ bits.length;
  for (let index = 0; index < bits.length; index++) hash = Math.imul(hash ^ bits[index]!, 0x01000193);
  return hash >>> 0;
}

/**
 * Reads positions as their 32-bit patterns, so minus zero and plus zero stay
 * apart.
 *
 * @param positions Positions.
 * @returns Bit patterns.
 */
function solidBrushEdgeHullBits(positions: Float32Array): Uint32Array {
  return new Uint32Array(positions.buffer, positions.byteOffset, positions.length);
}

/**
 * Tells whether two hulls have exactly the same positions, bit for bit.
 *
 * @param a First hull.
 * @param b Second hull.
 * @returns True when they do.
 */
function solidBrushEdgeHullSame(a: Uint32Array, b: Uint32Array): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index++) if (a[index] !== b[index]) return false;
  return true;
}

/**
 * Edges of the generated brushes of one solid, found again by the exact hull
 * positions they were baked from. A rebuild hands back new brushes even when
 * their shape stayed; those keep their edges instead of baking them again. Only
 * the shapes of the last two edge refreshes are kept.
 */
export class SolidBrushEdgeHullCache {
  /** Entries of the previous refresh, by hash. */
  private kept = new Map<number, SolidBrushEdgeHullEntry[]>();
  /** Entries of the refresh going on, by hash. */
  private used = new Map<number, SolidBrushEdgeHullEntry[]>();

  /**
   * Returns the edges of a hull, baking them only when no kept entry has the
   * same positions.
   *
   * @param hull Hull triangle positions.
   * @param bake Bakes the edges of the hull.
   * @returns Entry.
   */
  edges(hull: Float32Array, bake: () => Float32Array | null): SolidBrushEdgeHullEntry {
    const bits = solidBrushEdgeHullBits(hull);
    const hash = solidBrushEdgeHullHash(bits);
    const same = (entry: SolidBrushEdgeHullEntry) => solidBrushEdgeHullSame(solidBrushEdgeHullBits(entry.hull), bits);
    const found = this.used.get(hash)?.find(same) ?? this.kept.get(hash)?.find(same);
    const entry = found ?? { hull, edges: bake() };
    this.keep(entry, hash);
    return entry;
  }

  /**
   * Keeps an entry for the next refresh.
   *
   * @param entry Entry.
   * @param hash Its hash, when known.
   */
  keep(entry: SolidBrushEdgeHullEntry, hash = solidBrushEdgeHullHash(solidBrushEdgeHullBits(entry.hull))): void {
    const list = this.used.get(hash);
    if (!list) this.used.set(hash, [entry]);
    else if (!list.includes(entry)) list.push(entry);
  }

  /** Ends a refresh: only the entries it used are kept for the next. */
  roll(): void {
    this.kept = this.used;
    this.used = new Map();
  }
}
