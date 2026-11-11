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
});
