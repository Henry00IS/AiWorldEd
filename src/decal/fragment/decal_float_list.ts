/** Growable float list that keeps its storage between uses. */
export class DecalFloatList {
  private values = new Float32Array(256);
  private used = 0;

  /**
   * Returns the number of stored floats.
   *
   * @returns Float count.
   */
  length(): number {
    return this.used;
  }

  /** Forgets every stored float while keeping the storage. */
  clear(): void {
    this.used = 0;
  }

  /**
   * Appends three floats.
   *
   * @param first First float.
   * @param second Second float.
   * @param third Third float.
   */
  pushTriple(first: number, second: number, third: number): void {
    this.capacityEnsure(this.used + 3);
    this.values[this.used] = first;
    this.values[this.used + 1] = second;
    this.values[this.used + 2] = third;
    this.used += 3;
  }

  /**
   * Appends two floats.
   *
   * @param first First float.
   * @param second Second float.
   */
  pushPair(first: number, second: number): void {
    this.capacityEnsure(this.used + 2);
    this.values[this.used] = first;
    this.values[this.used + 1] = second;
    this.used += 2;
  }

  /**
   * Returns a detached copy of the stored floats.
   *
   * @returns New array holding exactly the stored floats.
   */
  snapshot(): Float32Array {
    return this.values.slice(0, this.used);
  }

  /**
   * Grows the storage so it holds at least the requested float count.
   *
   * @param required Float count that must fit.
   */
  private capacityEnsure(required: number): void {
    if (required <= this.values.length) return;
    const grown = new Float32Array(Math.max(required, this.values.length * 2));
    grown.set(this.values.subarray(0, this.used));
    this.values = grown;
  }
}
