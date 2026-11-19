/** Modifier keys held during a press on a row. */
export interface SelectionRowsModifiers {
  /** True while Shift is held. */
  shift: boolean;
  /** True while Ctrl or Cmd is held. */
  ctrl: boolean;
}

/**
 * Selection rules shared by every list of rows: a plain click selects the row
 * alone, Shift+click adds the row, Ctrl+click toggles the row (Ctrl wins over
 * Shift), a right-click keeps the selection when it holds the row and selects
 * the row alone otherwise, and a modifier drag paints from the pressed row:
 * Shift paints rows in, Ctrl paints rows out.
 */
export class SelectionRowsRules {
  /**
   * Returns the selection after a click on a row.
   *
   * @param selection Selection before the click.
   * @param row Clicked row.
   * @param modifiers Modifier keys held during the click.
   * @returns New selection; the given one is left unchanged.
   */
  static clickApply<Row>(selection: ReadonlySet<Row>, row: Row, modifiers: SelectionRowsModifiers): Set<Row> {
    if (modifiers.ctrl) return SelectionRowsRules.rowToggle(selection, row);
    if (modifiers.shift) return new Set(selection).add(row);
    return new Set([row]);
  }

  /**
   * Returns the selection after a right-click on a row, before its menu opens.
   *
   * @param selection Selection before the right-click.
   * @param row Right-clicked row.
   * @returns The same rows when they hold the row, otherwise the row alone.
   */
  static contextApply<Row>(selection: ReadonlySet<Row>, row: Row): Set<Row> {
    return selection.has(row) ? new Set(selection) : new Set([row]);
  }

  /**
   * Returns the selection after painting rows on top of the selection a paint
   * gesture started from.
   *
   * @param base Selection when the gesture started.
   * @param painted Painted rows.
   * @param subtractive True removes the painted rows, false adds them.
   * @returns New selection; the given one is left unchanged.
   */
  static paintApply<Row>(base: ReadonlySet<Row>, painted: Iterable<Row>, subtractive: boolean): Set<Row> {
    const next = new Set(base);
    for (const row of painted) {
      if (subtractive) next.delete(row);
      else next.add(row);
    }
    return next;
  }

  /**
   * Returns the selection with one row flipped in or out.
   *
   * @param selection Selection before the toggle.
   * @param row Row to flip.
   * @returns New selection.
   */
  private static rowToggle<Row>(selection: ReadonlySet<Row>, row: Row): Set<Row> {
    const next = new Set(selection);
    if (next.has(row)) next.delete(row);
    else next.add(row);
    return next;
  }
}
