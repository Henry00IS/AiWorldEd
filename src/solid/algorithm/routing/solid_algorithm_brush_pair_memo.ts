/**
 * Remembers one value per ordered pair of geometry objects. Entries are held
 * weakly so values for replaced brush geometry are released together with it.
 */
export class SolidAlgorithmBrushPairMemo<Value> {
  private valuesByFirstKey = new WeakMap<object, WeakMap<object, Value>>();

  /**
   * Returns the value stored for an ordered pair.
   *
   * @param firstKey First geometry object of the pair.
   * @param secondKey Second geometry object of the pair.
   * @returns Stored value, or undefined when the pair was never stored.
   */
  get(firstKey: object, secondKey: object): Value | undefined {
    return this.valuesByFirstKey.get(firstKey)?.get(secondKey);
  }

  /**
   * Stores the value for an ordered pair, replacing any previous value.
   *
   * @param firstKey First geometry object of the pair.
   * @param secondKey Second geometry object of the pair.
   * @param value Value to remember.
   */
  set(firstKey: object, secondKey: object, value: Value): void {
    let valuesBySecondKey = this.valuesByFirstKey.get(firstKey);
    if (!valuesBySecondKey) {
      valuesBySecondKey = new WeakMap();
      this.valuesByFirstKey.set(firstKey, valuesBySecondKey);
    }
    valuesBySecondKey.set(secondKey, value);
  }

  /** Forgets every stored pair. */
  clear(): void {
    this.valuesByFirstKey = new WeakMap();
  }
}
