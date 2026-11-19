import { describe, expect, it } from 'vitest';
import { SelectionRowsRules } from '@/selection/rows/selection_rows_rules.js';

/** No modifier keys. */
const PLAIN = { shift: false, ctrl: false };
/** Shift held. */
const SHIFT = { shift: true, ctrl: false };
/** Ctrl or Cmd held. */
const CTRL = { shift: false, ctrl: true };
/** Shift and Ctrl held. */
const SHIFT_CTRL = { shift: true, ctrl: true };

/**
 * Returns the rows of a selection in order.
 *
 * @param selection Selection.
 * @returns Sorted rows.
 */
function sorted(selection: ReadonlySet<number>): number[] {
  return [...selection].sort((a, b) => a - b);
}

describe('SelectionRowsRules', () => {
  it('selects the clicked row alone on a plain click', () => {
    expect(sorted(SelectionRowsRules.clickApply(new Set([1, 2, 3]), 5, PLAIN))).toEqual([5]);
    expect(sorted(SelectionRowsRules.clickApply(new Set([1, 2, 3]), 2, PLAIN))).toEqual([2]);
  });

  it('adds the clicked row on Shift+click and never removes it', () => {
    expect(sorted(SelectionRowsRules.clickApply(new Set([1, 3]), 5, SHIFT))).toEqual([1, 3, 5]);
    expect(sorted(SelectionRowsRules.clickApply(new Set([1, 3]), 3, SHIFT))).toEqual([1, 3]);
  });

  it('toggles the clicked row on Ctrl+click, with Ctrl winning over Shift', () => {
    expect(sorted(SelectionRowsRules.clickApply(new Set([1, 3]), 5, CTRL))).toEqual([1, 3, 5]);
    expect(sorted(SelectionRowsRules.clickApply(new Set([1, 3]), 3, CTRL))).toEqual([1]);
    expect(sorted(SelectionRowsRules.clickApply(new Set([1, 3]), 3, SHIFT_CTRL))).toEqual([1]);
    expect(sorted(SelectionRowsRules.clickApply(new Set([3]), 3, CTRL))).toEqual([]);
  });

  it('keeps the selection on a right-click inside it and selects the row alone outside it', () => {
    expect(sorted(SelectionRowsRules.contextApply(new Set([0, 1, 2, 3, 4, 5]), 2))).toEqual([0, 1, 2, 3, 4, 5]);
    expect(sorted(SelectionRowsRules.contextApply(new Set([0, 1, 2]), 7))).toEqual([7]);
  });

  it('paints rows in or out on top of the starting selection', () => {
    expect(sorted(SelectionRowsRules.paintApply(new Set([0, 9]), [3, 4, 5], false))).toEqual([0, 3, 4, 5, 9]);
    expect(sorted(SelectionRowsRules.paintApply(new Set([2, 3, 4, 5]), [3, 4], true))).toEqual([2, 5]);
  });

  it('never changes the selection it was given', () => {
    const selection = new Set([1, 2]);
    SelectionRowsRules.clickApply(selection, 2, CTRL);
    SelectionRowsRules.contextApply(selection, 9);
    SelectionRowsRules.paintApply(selection, [1], true);
    expect(sorted(selection)).toEqual([1, 2]);
  });
});
