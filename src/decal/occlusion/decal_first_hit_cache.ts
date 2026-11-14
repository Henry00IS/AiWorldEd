/** One remembered triangle cut: the pieces and new corners it produced. */
export interface DecalFirstHitCut {
  /** Pieces in the order the cut produced them. */
  pieces: { outline: number[]; whole: boolean }[];
  /** Corners the cut created, x, y, z each. */
  cutCorners: number[];
}

/**
 * Triangle cuts of one decal remembered from its last pass, so a recut after a
 * nearby edit redoes only the triangles whose surroundings changed. A cut is
 * found by everything it depends on, bit for bit, so a reused cut is exactly
 * the cut that would be made again. Cuts unused in a pass are forgotten.
 */
export class DecalFirstHitCache {
  private previous = new Map<number, { key: Uint32Array; cut: DecalFirstHitCut }[]>();
  private current = new Map<number, { key: Uint32Array; cut: DecalFirstHitCut }[]>();

  /** Starts a pass: cuts of the last pass stay findable until the next one. */
  passBegin(): void {
    this.previous = this.current;
    this.current = new Map();
  }

  /**
   * Finds a remembered cut and keeps it for the next pass too.
   *
   * @param key What the cut depends on.
   * @returns Cut or undefined.
   */
  find(key: Uint32Array): DecalFirstHitCut | undefined {
    const hash = decalKeyHash(key);
    const now = decalCutFind(this.current.get(hash), key);
    if (now) return now;
    const before = decalCutFind(this.previous.get(hash), key);
    if (before) this.remember(hash, key.slice(), before);
    return before;
  }

  /**
   * Remembers a cut.
   *
   * @param key What the cut depends on; copied.
   * @param cut Cut.
   */
  store(key: Uint32Array, cut: DecalFirstHitCut): void {
    this.remember(decalKeyHash(key), key.slice(), cut);
  }

  /**
   * Adds a cut to this pass's map.
   *
   * @param hash Key hash.
   * @param key Owned key.
   * @param cut Cut.
   */
  private remember(hash: number, key: Uint32Array, cut: DecalFirstHitCut): void {
    const list = this.current.get(hash);
    if (list) list.push({ key, cut });
    else this.current.set(hash, [{ key, cut }]);
  }
}

/**
 * Returns the cut stored under the same key in a hash bucket.
 *
 * @param list Bucket.
 * @param key Key.
 * @returns Cut or undefined.
 */
function decalCutFind(
  list: { key: Uint32Array; cut: DecalFirstHitCut }[] | undefined,
  key: Uint32Array,
): DecalFirstHitCut | undefined {
  if (!list) return undefined;
  for (const entry of list) {
    if (entry.key.length !== key.length) continue;
    let same = true;
    for (let index = 0; index < key.length && same; index++) same = entry.key[index] === key[index];
    if (same) return entry.cut;
  }
  return undefined;
}

/**
 * Hashes a key.
 *
 * @param key Key words.
 * @returns Hash.
 */
function decalKeyHash(key: Uint32Array): number {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index++) hash = Math.imul(hash ^ key[index]!, 16777619);
  return hash >>> 0;
}
