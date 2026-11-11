import type * as THREE from 'three';

/**
 * Selection bookkeeping for one paint gesture: the selection it started from,
 * and rows the editor refused (for example rows another room member is editing)
 * so they are not retried on every pointer move.
 */
export class OutlinerPaintSelectionState {
  private base: Set<THREE.Object3D>;
  private readonly refused: Set<THREE.Object3D>;

  /** Creates an empty state. */
  constructor() {
    this.base = new Set();
    this.refused = new Set();
  }

  /**
   * Starts a gesture from the current selection.
   *
   * @param current Selection before painting.
   */
  begin(current: ReadonlySet<THREE.Object3D>): void {
    this.base = new Set(current);
    this.refused.clear();
  }

  /**
   * Applies the painted range on top of the starting selection. Additive
   * selects the painted rows; subtractive deselects them. Rows that left the
   * painted range return to their starting state. When the editor refuses the
   * whole set, rows are changed one at a time and refused ones are skipped.
   *
   * @param painted Painted rows in tree order.
   * @param current Current selection.
   * @param tryApply Applies a selection, returning false when refused.
   * @param subtractive True to deselect the painted rows.
   */
  apply(
    painted: readonly THREE.Object3D[],
    current: ReadonlySet<THREE.Object3D>,
    tryApply: (next: Set<THREE.Object3D>) => boolean,
    subtractive: boolean = false,
  ): void {
    if (subtractive) {
      this.applySubtractive(painted, tryApply);
      return;
    }
    this.applyAdditive(painted, current, tryApply);
  }

  /**
   * Selects the starting selection plus the painted rows.
   *
   * @param painted Painted rows in tree order.
   * @param current Current selection.
   * @param tryApply Applies a selection, returning false when refused.
   */
  private applyAdditive(
    painted: readonly THREE.Object3D[],
    current: ReadonlySet<THREE.Object3D>,
    tryApply: (next: Set<THREE.Object3D>) => boolean,
  ): void {
    const kept = new Set(this.base);
    painted.forEach((object) => current.has(object) && kept.add(object));
    const wanted = painted.filter((object) => !kept.has(object) && !this.refused.has(object));
    if (tryApply(new Set([...kept, ...wanted]))) return;
    this.applyWantedOneByOne(wanted, kept, tryApply, (accepted, object) => new Set(accepted).add(object));
  }

  /**
   * Deselects painted rows that were in the starting selection.
   *
   * @param painted Painted rows in tree order.
   * @param tryApply Applies a selection, returning false when refused.
   */
  private applySubtractive(painted: readonly THREE.Object3D[], tryApply: (next: Set<THREE.Object3D>) => boolean): void {
    const wanted = painted.filter((object) => this.base.has(object) && !this.refused.has(object));
    const next = new Set(this.base);
    wanted.forEach((object) => next.delete(object));
    if (tryApply(next)) return;
    const accepted = new Set(this.base);
    this.applyWantedOneByOne(wanted, accepted, tryApply, (current, object) => {
      const candidate = new Set(current);
      candidate.delete(object);
      return candidate;
    });
  }

  /**
   * Tries the starting set, then applies each wanted row one at a time.
   *
   * @param wanted Rows still to add or remove.
   * @param starting Set to begin from.
   * @param tryApply Applies a selection, returning false when refused.
   * @param nextFrom Builds the next set from the accepted set and one row.
   */
  private applyWantedOneByOne(
    wanted: readonly THREE.Object3D[],
    starting: Set<THREE.Object3D>,
    tryApply: (next: Set<THREE.Object3D>) => boolean,
    nextFrom: (accepted: Set<THREE.Object3D>, object: THREE.Object3D) => Set<THREE.Object3D>,
  ): void {
    let accepted = starting;
    tryApply(accepted);
    for (const object of wanted) {
      const next = nextFrom(accepted, object);
      if (tryApply(next)) accepted = next;
      else this.refused.add(object);
    }
  }
}
