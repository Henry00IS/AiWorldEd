/** Largest number of derived brushes one solid may receive from all volumes. */
export const MODIFIER_STACK_MAX_DERIVED_BRUSHES = 4096;

/** Shared allowance of derived brushes for one compile of one solid. */
export class ModifierStackBudget {
  private remainingBrushes: number;
  private cut = false;

  /**
   * Creates an allowance.
   *
   * @param limit Number of derived brushes that may still be created.
   */
  constructor(limit: number = MODIFIER_STACK_MAX_DERIVED_BRUSHES) {
    this.remainingBrushes = Math.max(0, Math.floor(limit));
  }

  /**
   * Returns how many derived brushes may still be created.
   *
   * @returns Remaining allowance.
   */
  remaining(): number {
    return this.remainingBrushes;
  }

  /**
   * Reserves whole copies of a working set, never more than the allowance.
   *
   * @param brushesPerCopy Brushes created by one copy.
   * @param copiesWanted Copies requested.
   * @returns Copies granted, from zero to copiesWanted.
   */
  takeCopies(brushesPerCopy: number, copiesWanted: number): number {
    if (brushesPerCopy <= 0) return Math.max(0, copiesWanted);
    const granted = Math.max(0, Math.min(copiesWanted, Math.floor(this.remainingBrushes / brushesPerCopy)));
    this.remainingBrushes -= granted * brushesPerCopy;
    if (granted < copiesWanted) this.cut = true;
    return granted;
  }

  /**
   * Returns whether any request so far got fewer copies than it asked for.
   *
   * @returns True once the allowance limited a request.
   */
  limited(): boolean {
    return this.cut;
  }

  /**
   * Charges brushes a cached evaluation made earlier.
   *
   * @param brushes Brush count to charge.
   */
  consume(brushes: number): void {
    this.remainingBrushes = Math.max(0, this.remainingBrushes - Math.max(0, brushes));
  }
}
