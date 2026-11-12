import { PAINT_PAGE_SLOT_COUNT } from '@/paint/paint_constants.js';

/** A tile that compaction moved from one slot to another. */
export interface PaintAtlasMove {
  readonly key: string;
  readonly from: number;
  readonly to: number;
}

/**
 * Hands out uniform atlas slots to tile keys. Slots are numbered globally (page
 * · slots per page + slot), always taken lowest first, and freed slots are
 * reused, so the atlas never fragments; compaction moves tiles out of the last
 * pages so they can be dropped.
 */
export class PaintAtlasAllocator {
  private readonly slotOwners: (string | null)[] = [];
  private readonly slotByKey = new Map<string, number>();
  private firstFreeHint = 0;

  /** Number of pages the slots span. */
  get pageCount(): number {
    return Math.ceil(this.slotOwners.length / PAINT_PAGE_SLOT_COUNT);
  }

  /** Number of slots in use. */
  get usedCount(): number {
    return this.slotByKey.size;
  }

  /**
   * Returns the slot of a key.
   *
   * @param key Tile key.
   * @returns Slot, or undefined when the key has none.
   */
  get(key: string): number | undefined {
    return this.slotByKey.get(key);
  }

  /**
   * Returns the key that owns a slot.
   *
   * @param slot Slot.
   * @returns Key, or null when free.
   */
  ownerOf(slot: number): string | null {
    return this.slotOwners[slot] ?? null;
  }

  /** Every key with a slot. */
  keys(): IterableIterator<string> {
    return this.slotByKey.keys();
  }

  /**
   * Returns the key's slot, taking the lowest free slot when it has none and
   * growing by one page when every slot is taken.
   *
   * @param key Tile key.
   * @returns Slot.
   */
  allocate(key: string): number {
    const existing = this.slotByKey.get(key);
    if (existing !== undefined) return existing;
    let slot = this.firstFreeHint;
    while (slot < this.slotOwners.length && this.slotOwners[slot] !== null) slot++;
    if (slot >= this.slotOwners.length) {
      const start = this.slotOwners.length;
      for (let index = 0; index < PAINT_PAGE_SLOT_COUNT; index++) this.slotOwners.push(null);
      slot = start;
    }
    this.slotOwners[slot] = key;
    this.slotByKey.set(key, slot);
    this.firstFreeHint = slot + 1;
    return slot;
  }

  /**
   * Releases a key's slot.
   *
   * @param key Tile key.
   * @returns The freed slot, or undefined when the key had none.
   */
  free(key: string): number | undefined {
    const slot = this.slotByKey.get(key);
    if (slot === undefined) return undefined;
    this.slotByKey.delete(key);
    this.slotOwners[slot] = null;
    if (slot < this.firstFreeHint) this.firstFreeHint = slot;
    return slot;
  }

  /**
   * Returns whether compaction could drop at least one page.
   *
   * @returns True when the used slots fit in fewer pages.
   */
  canShrink(): boolean {
    return Math.ceil(this.usedCount / PAINT_PAGE_SLOT_COUNT) < this.pageCount;
  }

  /**
   * Moves tiles out of the pages the used slots no longer need into the lowest
   * free slots, then drops those pages. Tiles already in the kept pages stay
   * where they are, so compaction copies as little as possible.
   *
   * @returns Moves the caller must mirror in the page textures.
   */
  compact(): PaintAtlasMove[] {
    const moves: PaintAtlasMove[] = [];
    const keptSlots = Math.ceil(this.usedCount / PAINT_PAGE_SLOT_COUNT) * PAINT_PAGE_SLOT_COUNT;
    let low = 0;
    for (let high = keptSlots; high < this.slotOwners.length; high++) {
      const key = this.slotOwners[high];
      if (key === null || key === undefined) continue;
      while (this.slotOwners[low] !== null) low++;
      this.slotOwners[low] = key;
      this.slotOwners[high] = null;
      this.slotByKey.set(key, low);
      moves.push({ key, from: high, to: low });
    }
    this.slotOwners.length = keptSlots;
    this.firstFreeHint = 0;
    return moves;
  }
}
