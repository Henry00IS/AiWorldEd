/** Binary max-heap ordered by a score, for picking the best candidate quickly. */
export class BlastHoleHeapMax<T> {
  private readonly items: { score: number; value: T }[] = [];

  /**
   * Returns the number of queued items.
   *
   * @returns Count.
   */
  get size(): number {
    return this.items.length;
  }

  /**
   * Queues an item.
   *
   * @param score Higher comes out first.
   * @param value Item.
   */
  push(score: number, value: T): void {
    this.items.push({ score, value });
    let at = this.items.length - 1;
    while (at > 0) {
      const parent = (at - 1) >> 1;
      if (this.items[parent]!.score >= this.items[at]!.score) break;
      this.swap(at, parent);
      at = parent;
    }
  }

  /**
   * Takes out the item with the highest score.
   *
   * @returns Item, or undefined when empty.
   */
  pop(): T | undefined {
    const top = this.items[0];
    const last = this.items.pop();
    if (!top || !last) return undefined;
    if (this.items.length > 0) {
      this.items[0] = last;
      this.sink(0);
    }
    return top.value;
  }

  /**
   * Moves an item down until both children score lower.
   *
   * @param start Index.
   */
  private sink(start: number): void {
    let at = start;
    for (;;) {
      const left = at * 2 + 1;
      const right = left + 1;
      let best = at;
      if (left < this.items.length && this.items[left]!.score > this.items[best]!.score) best = left;
      if (right < this.items.length && this.items[right]!.score > this.items[best]!.score) best = right;
      if (best === at) return;
      this.swap(at, best);
      at = best;
    }
  }

  /**
   * Swaps two items.
   *
   * @param a First index.
   * @param b Second index.
   */
  private swap(a: number, b: number): void {
    const item = this.items[a]!;
    this.items[a] = this.items[b]!;
    this.items[b] = item;
  }
}
