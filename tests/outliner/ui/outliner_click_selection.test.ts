import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { PanelOutliner } from '@/outliner/ui/panel_outliner.js';
import { rowByName } from './outliner_test_rows.js';

/** Names of the meshes in the test tree, in order. */
const NAMES = ['RowA', 'RowB', 'RowC', 'RowD'];

describe('Outliner row selection follows the shared row rules', () => {
  let container: HTMLElement;
  let selectionManager: ManagerSelection;
  let panel: PanelOutliner;
  let meshes: THREE.Mesh[];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    selectionManager = new ManagerSelection();
    const root = new THREE.Group();
    meshes = NAMES.map((name) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
      mesh.name = name;
      return mesh;
    });
    root.add(...meshes);
    panel = new PanelOutliner(container, selectionManager, root);
    panel.refresh();
  });

  afterEach(() => {
    panel.dispose();
    selectionManager.dispose();
    container.remove();
  });

  /**
   * Clicks a row by its object name.
   *
   * @param name Object name.
   * @param init Modifier keys.
   */
  function click(name: string, init: MouseEventInit = {}): void {
    rowByName(container, name).dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1, ...init }));
  }

  /**
   * Returns the names of the selected objects in tree order.
   *
   * @returns Selected names.
   */
  function selectedNames(): string[] {
    return meshes.filter((mesh) => selectionManager.isObjectSelected(mesh)).map((mesh) => mesh.name);
  }

  it('selects a row alone on a plain click', () => {
    click('RowA');
    click('RowC');
    expect(selectedNames()).toEqual(['RowC']);
  });

  it('adds a row on Shift+click', () => {
    click('RowA');
    click('RowC', { shiftKey: true });
    click('RowC', { shiftKey: true });
    expect(selectedNames()).toEqual(['RowA', 'RowC']);
  });

  it('toggles a row on Ctrl+click, removing only that row', () => {
    click('RowA');
    click('RowB', { ctrlKey: true });
    click('RowD', { ctrlKey: true });
    click('RowB', { ctrlKey: true });
    expect(selectedNames()).toEqual(['RowA', 'RowD']);
  });

  it('toggles on Shift+Ctrl+click, with Ctrl winning over Shift', () => {
    click('RowA');
    click('RowB', { shiftKey: true, ctrlKey: true });
    expect(selectedNames()).toEqual(['RowA', 'RowB']);
    click('RowB', { shiftKey: true, ctrlKey: true });
    expect(selectedNames()).toEqual(['RowA']);
  });

  it('keeps the selection on a right-click inside it and selects the row alone outside it', () => {
    click('RowA');
    click('RowB', { shiftKey: true });
    click('RowC', { shiftKey: true });
    rowByName(container, 'RowB').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(selectedNames()).toEqual(['RowA', 'RowB', 'RowC']);
    rowByName(container, 'RowD').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(selectedNames()).toEqual(['RowD']);
  });
});
