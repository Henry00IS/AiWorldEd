/**
 * Remembers one value per ordered pair of geometry objects. Entries are held
 * weakly so values for replaced brush geometry are released together with it.
 */
export class SolidAlgorithmBrushPairMemo<Value> {
  private valuesByFirstKey = new WeakMap<object, WeakMap<object, Value>>();
  /**
   * First key of the most recent outer lookup (callers walk one subject's
   * peers); held strongly, so at most one geometry outlives its brush here.
   */
  private lastFirstKey: object | null = null;
  /** Inner map found for {@link lastFirstKey}, or undefined when it had none. */
  private lastValuesBySecondKey: WeakMap<object, Value> | undefined = undefined;

  /**
   * Returns the value stored for an ordered pair.
   *
   * @param firstKey First geometry object of the pair.
   * @param secondKey Second geometry object of the pair.
   * @returns Stored value, or undefined when the pair was never stored.
   */
  get(firstKey: object, secondKey: object): Value | undefined {
    return this.valuesForFirstKey(firstKey)?.get(secondKey);
  }

  /**
   * Returns the inner map of a first key, reusing the previous outer lookup
   * when the first key repeats.
   *
   * @param firstKey First geometry object of a pair.
   * @returns Inner map, or undefined when nothing is stored for the key.
   */
  private valuesForFirstKey(firstKey: object): WeakMap<object, Value> | undefined {
    if (firstKey !== this.lastFirstKey) {
      this.lastFirstKey = firstKey;
      this.lastValuesBySecondKey = this.valuesByFirstKey.get(firstKey);
    }
    return this.lastValuesBySecondKey;
  }

  /**
   * Stores the value for an ordered pair, replacing any previous value.
   *
   * @param firstKey First geometry object of the pair.
   * @param secondKey Second geometry object of the pair.
   * @param value Value to remember.
   */
  set(firstKey: object, secondKey: object, value: Value): void {
    let valuesBySecondKey = this.valuesForFirstKey(firstKey);
    if (!valuesBySecondKey) {
      valuesBySecondKey = new WeakMap();
      this.valuesByFirstKey.set(firstKey, valuesBySecondKey);
      this.lastValuesBySecondKey = valuesBySecondKey;
    }
    valuesBySecondKey.set(secondKey, value);
  }

  /** Forgets every stored pair. */
  clear(): void {
    this.valuesByFirstKey = new WeakMap();
    this.lastFirstKey = null;
    this.lastValuesBySecondKey = undefined;
  }
}
