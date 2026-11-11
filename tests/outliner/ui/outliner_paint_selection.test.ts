import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { PanelOutliner } from '@/outliner/ui/panel_outliner.js';
import { OutlinerPaintSelectionState } from '@/outliner/ui/outliner_paint_selection_state.js';
import { OUTLINER_ROW_HEIGHT_PX, OUTLINER_TREE_PADDING_PX } from '@/outliner/ui/outliner_drop_placement.js';

/**
 * Returns the pointer Y in the middle of a visible row.
 *
 * @param index Row index.
 * @returns Client Y.
 */
function rowMiddleY(index: number): number {
  return OUTLINER_TREE_PADDING_PX + index * OUTLINER_ROW_HEIGHT_PX + OUTLINER_ROW_HEIGHT_PX / 2;
}

/**
 * Finds the visible row element of a named object.
 *
 * @param container Panel container.
 * @param name Object name.
 * @returns Row element.
 */
function rowByName(container: HTMLElement, name: string): HTMLElement {
  const row = Array.from(container.querySelectorAll<HTMLElement>('.editor-outliner-row')).find(
    (element) => element.style.display !== 'none' && element.textContent?.includes(name),
  );
  if (!row) throw new Error(`missing row ${name}`);
  return row;
}

/** Shift-drag paint selection in the outliner panel. */
describe('Outliner Shift-drag paint selection', () => {
  let container: HTMLElement;
  let selectionManager: ManagerSelection;
  let root: THREE.Group;
  let panel: PanelOutliner;
  let meshes: THREE.Mesh[];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    selectionManager = new ManagerSelection();
    root = new THREE.Group();
    meshes = [0, 1, 2, 3, 4, 5].map((index) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
      mesh.name = `Crate${index}`;
      root.add(mesh);
      return mesh;
    });
    panel = new PanelOutliner(container, selectionManager, root);
    panel.refresh();
  });

  afterEach(() => {
    panel.dispose();
    selectionManager.dispose();
    container.remove();
  });

  /**
   * Presses Shift on a row and moves the pointer to other rows.
   *
   * @param fromIndex Row pressed.
   * @param toIndexes Rows the pointer visits, in order.
   * @returns The press event.
   */
  function paint(fromIndex: number, ...toIndexes: number[]): MouseEvent {
    const press = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      shiftKey: true,
      clientY: rowMiddleY(fromIndex),
    });
    rowByName(container, `Crate${fromIndex}`).dispatchEvent(press);
    for (const index of toIndexes) {
      document.dispatchEvent(
        new MouseEvent('mousemove', {
          bubbles: true,
          cancelable: true,
          buttons: 1,
          shiftKey: true,
          clientY: rowMiddleY(index),
        }),
      );
    }
    return press;
  }

  /**
   * Returns the selected crate indexes, sorted.
   *
   * @returns Indexes.
   */
  function selectedIndexes(): number[] {
    return selectionManager
      .getAllSelectedObjectsAsArray()
      .map((mesh) => meshes.indexOf(mesh))
      .sort((a, b) => a - b);
  }

  it('selects every row from the pressed one to the row under the pointer', () => {
    const press = paint(1, 2, 3, 4);
    expect(press.defaultPrevented).toBe(true);
    expect(selectedIndexes()).toEqual([1, 2, 3, 4]);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });

  it('shrinks and flips the range as the pointer moves back past the pressed row', () => {
    paint(2, 4, 0);
    expect(selectedIndexes()).toEqual([0, 1, 2]);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });

  it('adds the painted rows to the selection that was there before', () => {
    selectionManager.setSelection([meshes[5]!]);
    paint(1, 2);
    expect(selectedIndexes()).toEqual([1, 2, 5]);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });

  it('stops painting after the release', () => {
    paint(0, 1);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, buttons: 1, clientY: rowMiddleY(4) }));
    expect(selectedIndexes()).toEqual([0, 1]);
  });

  it('leaves the selection alone while the pointer stays on the pressed row', () => {
    selectionManager.setSelection([meshes[5]!]);
    paint(3, 3);
    expect(selectedIndexes()).toEqual([5]);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
});

/** Selection bookkeeping of one paint gesture. */
describe('OutlinerPaintSelectionState', () => {
  it('skips rows the editor refuses and keeps painting the others', () => {
    const rows = [0, 1, 2, 3].map(() => new THREE.Object3D());
    const held = rows[1]!;
    let current = new Set<THREE.Object3D>();
    let attempts = 0;
    const tryApply = (next: Set<THREE.Object3D>): boolean => {
      attempts += 1;
      if (next.has(held)) return false;
      current = next;
      return true;
    };
    const state = new OutlinerPaintSelectionState();
    state.begin(current);
    state.apply(rows.slice(0, 3), current, tryApply);
    expect([...current]).toEqual([rows[0], rows[2]]);
    attempts = 0;
    state.apply(rows, current, tryApply);
    expect([...current]).toEqual([rows[0], rows[2], rows[3]]);
    expect(attempts).toBe(1);
  });

  it('skips rows the editor refuses to deselect and keeps removing the others', () => {
    const rows = [0, 1, 2, 3].map(() => new THREE.Object3D());
    const locked = rows[1]!;
    let current = new Set<THREE.Object3D>(rows);
    let attempts = 0;
    const tryApply = (next: Set<THREE.Object3D>): boolean => {
      attempts += 1;
      if (!next.has(locked)) return false;
      current = next;
      return true;
    };
    const state = new OutlinerPaintSelectionState();
    state.begin(current);
    state.apply(rows.slice(0, 3), current, tryApply, true);
    expect([...current]).toEqual([rows[1], rows[3]]);
    attempts = 0;
    state.apply(rows, current, tryApply, true);
    expect([...current]).toEqual([rows[1]]);
    expect(attempts).toBe(1);
  });

  it('puts rows back when they leave a subtractive painted range', () => {
    const rows = [0, 1, 2, 3].map(() => new THREE.Object3D());
    let current = new Set<THREE.Object3D>(rows);
    const tryApply = (next: Set<THREE.Object3D>): boolean => {
      current = next;
      return true;
    };
    const state = new OutlinerPaintSelectionState();
    state.begin(new Set(rows));
    state.apply(rows.slice(0, 3), current, tryApply, true);
    expect([...current]).toEqual([rows[3]]);
    state.apply(rows.slice(0, 1), current, tryApply, true);
    expect([...current]).toEqual([rows[1], rows[2], rows[3]]);
  });
});

/** Ctrl-drag and Meta-drag paint deselection in the outliner panel. */
describe('Outliner Ctrl-drag paint deselection', () => {
  let container: HTMLElement;
  let selectionManager: ManagerSelection;
  let root: THREE.Group;
  let panel: PanelOutliner;
  let meshes: THREE.Mesh[];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    selectionManager = new ManagerSelection();
    root = new THREE.Group();
    meshes = [0, 1, 2, 3, 4, 5].map((index) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
      mesh.name = `Crate${index}`;
      root.add(mesh);
      return mesh;
    });
    panel = new PanelOutliner(container, selectionManager, root);
    panel.refresh();
  });

  afterEach(() => {
    panel.dispose();
    selectionManager.dispose();
    container.remove();
  });

  /**
   * Presses a row with the given modifiers and moves the pointer to other rows.
   *
   * @param modifiers Modifier flags for the press and moves.
   * @param fromIndex Row pressed.
   * @param toIndexes Rows the pointer visits, in order.
   * @returns The press event.
   */
  function paintWith(
    modifiers: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean },
    fromIndex: number,
    ...toIndexes: number[]
  ): MouseEvent {
    const press = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      shiftKey: modifiers.shiftKey === true,
      ctrlKey: modifiers.ctrlKey === true,
      metaKey: modifiers.metaKey === true,
      clientY: rowMiddleY(fromIndex),
    });
    rowByName(container, `Crate${fromIndex}`).dispatchEvent(press);
    for (const index of toIndexes) {
      document.dispatchEvent(
        new MouseEvent('mousemove', {
          bubbles: true,
          cancelable: true,
          buttons: 1,
          shiftKey: modifiers.shiftKey === true,
          ctrlKey: modifiers.ctrlKey === true,
          metaKey: modifiers.metaKey === true,
          clientY: rowMiddleY(index),
        }),
      );
    }
    return press;
  }

  /**
   * Returns the selected crate indexes, sorted.
   *
   * @returns Indexes.
   */
  function selectedIndexes(): number[] {
    return selectionManager
      .getAllSelectedObjectsAsArray()
      .map((mesh) => meshes.indexOf(mesh))
      .sort((a, b) => a - b);
  }

  /** Selects every crate. */
  function selectAll(): void {
    selectionManager.setSelection(meshes);
  }

  it('deselects every row from the pressed one to the row under the pointer', () => {
    selectAll();
    const press = paintWith({ ctrlKey: true }, 1, 2, 3, 4);
    expect(press.defaultPrevented).toBe(true);
    expect(selectedIndexes()).toEqual([0, 5]);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });

  it('deselects the same way when Meta is held instead of Ctrl', () => {
    selectAll();
    const press = paintWith({ metaKey: true }, 1, 3);
    expect(press.defaultPrevented).toBe(true);
    expect(selectedIndexes()).toEqual([0, 4, 5]);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });

  it('restores rows that leave the range and flips when the pointer crosses the press', () => {
    selectAll();
    paintWith({ ctrlKey: true }, 2, 4, 0);
    expect(selectedIndexes()).toEqual([3, 4, 5]);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });

  it('leaves rows that were not selected alone', () => {
    selectionManager.setSelection([meshes[1]!, meshes[2]!, meshes[5]!]);
    paintWith({ ctrlKey: true }, 0, 3);
    expect(selectedIndexes()).toEqual([5]);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });

  it('stops deselecting after the release', () => {
    selectAll();
    paintWith({ ctrlKey: true }, 0, 1);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    document.dispatchEvent(
      new MouseEvent('mousemove', { bubbles: true, buttons: 1, ctrlKey: true, clientY: rowMiddleY(4) }),
    );
    expect(selectedIndexes()).toEqual([2, 3, 4, 5]);
  });

  it('leaves the selection alone while the pointer stays on the pressed row', () => {
    selectAll();
    paintWith({ ctrlKey: true }, 3, 3);
    expect(selectedIndexes()).toEqual([0, 1, 2, 3, 4, 5]);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });

  it('deselects when both Ctrl and Shift are held, matching face paint', () => {
    selectAll();
    paintWith({ ctrlKey: true, shiftKey: true }, 1, 3);
    expect(selectedIndexes()).toEqual([0, 4, 5]);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });

  it('toggles a single row on Ctrl-click without a drag', () => {
    selectionManager.setSelection([meshes[1]!, meshes[2]!]);
    const row = rowByName(container, 'Crate2');
    const flags = { bubbles: true, cancelable: true, button: 0, ctrlKey: true };
    row.dispatchEvent(new MouseEvent('mousedown', { ...flags, buttons: 1, clientY: rowMiddleY(2) }));
    row.dispatchEvent(new MouseEvent('mouseup', { ...flags, buttons: 0, clientY: rowMiddleY(2) }));
    row.dispatchEvent(new MouseEvent('click', { ...flags, detail: 1, clientY: rowMiddleY(2) }));
    expect(selectedIndexes()).toEqual([1]);
    row.dispatchEvent(new MouseEvent('click', { ...flags, detail: 1, clientY: rowMiddleY(2) }));
    expect(selectedIndexes()).toEqual([1, 2]);
  });

  it('does not paint or cancel a plain drag without Shift or Ctrl', () => {
    selectAll();
    const press = paintWith({}, 1, 4);
    expect(press.defaultPrevented).toBe(false);
    expect(selectedIndexes()).toEqual([0, 1, 2, 3, 4, 5]);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });

  it('asks face mode to remove faces of painted rows', () => {
    const calls: Array<{ name: string; isShiftPressed: boolean; isCtrlPressed: boolean }> = [];
    panel.setFaceModeSelectionHandler((hierarchyObject, isShiftPressed, isCtrlPressed) => {
      calls.push({ name: hierarchyObject.name, isShiftPressed, isCtrlPressed });
      return true;
    });
    selectAll();
    paintWith({ ctrlKey: true }, 1, 3);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((call) => call.isCtrlPressed && !call.isShiftPressed)).toBe(true);
    expect(calls.map((call) => call.name).sort()).toEqual(['Crate1', 'Crate2', 'Crate3']);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
});
