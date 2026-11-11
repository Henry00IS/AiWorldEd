import type * as THREE from 'three';

/**
 * Selection bookkeeping for one Shift-drag paint gesture: the selection it
 * started from, and rows the editor refused (for example rows another room
 * member is editing) so they are not retried on every pointer move.
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
   * Selects the starting selection plus the painted rows. Rows that left the
   * painted range drop out again. When the editor refuses the whole set, rows
   * are added one at a time and refused ones are skipped.
   *
   * @param painted Painted rows in tree order.
   * @param current Current selection.
   * @param tryApply Applies a selection, returning false when refused.
   */
  apply(
    painted: readonly THREE.Object3D[],
    current: ReadonlySet<THREE.Object3D>,
    tryApply: (next: Set<THREE.Object3D>) => boolean,
  ): void {
    const kept = new Set(this.base);
    painted.forEach((object) => current.has(object) && kept.add(object));
    const wanted = painted.filter((object) => !kept.has(object) && !this.refused.has(object));
    if (tryApply(new Set([...kept, ...wanted]))) return;
    let accepted = kept;
    tryApply(accepted);
    for (const object of wanted) {
      const next = new Set(accepted).add(object);
      if (tryApply(next)) accepted = next;
      else this.refused.add(object);
    }
  }
}
