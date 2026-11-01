import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { PanelOutliner, type OutlinerEditGate } from '@/outliner/ui/panel_outliner.js';
import { Theme } from '@/theme.js';

describe('OutlinerPanel', () => {
  let container: HTMLElement;
  let selectionManager: ManagerSelection;
  let root: THREE.Group;
  let panel: PanelOutliner;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    selectionManager = new ManagerSelection();
    root = new THREE.Group();
    panel = new PanelOutliner(container, selectionManager, root);
  });

  afterEach(() => {
    panel.dispose();
    selectionManager.dispose();
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  it('should have correct background color', () => {
    const panelElement = container.children[0] as HTMLElement;
    const expectedBg = `rgb(${(Theme.outlinerBackground >> 16) & 255}, ${(Theme.outlinerBackground >> 8) & 255}, ${Theme.outlinerBackground & 255})`;
    expect(panelElement.style.background).toBe(expectedBg);
  });

  it('should have left border matching separator color', () => {
    const panelElement = container.children[0] as HTMLElement;
    const expectedBorder = `rgb(${(Theme.separatorColor >> 16) & 255}, ${(Theme.separatorColor >> 8) & 255}, ${Theme.separatorColor & 255})`;
    expect(panelElement.style.borderLeft).toBe(`2px solid ${expectedBorder}`);
  });

  it('should have search input element', () => {
    const panelElement = container.children[0] as HTMLElement;
    const searchInput = panelElement.querySelector('input');
    expect(searchInput).not.toBeNull();
    expect(searchInput?.tagName).toBe('INPUT');
  });

  it('should refresh and display provided scene objects', () => {
    const mesh1 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh1.name = 'Cube001';
    const mesh2 = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 8), new THREE.MeshBasicMaterial());
    mesh2.name = 'Sphere001';
    root.add(mesh1);
    root.add(mesh2);
    panel.refresh();
    const rows = Array.from(container.querySelectorAll('.editor-outliner-row')).filter(
      (row) => (row as HTMLElement).style.display !== 'none',
    );
    expect(rows.length).toBe(2);
  });

  it('should display object names in tree items', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.name = 'TestCube';
    root.add(mesh);
    panel.refresh();
    const nameSpan = findOutlinerRowByName(container, 'TestCube').querySelector('span:nth-child(3)') as HTMLSpanElement;
    expect(nameSpan.textContent).toBe('TestCube');
  });

  it('should highlight selected objects in the tree', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.name = 'SelectedObj';
    root.add(mesh);
    selectionManager.selectObject(mesh);
    panel.refresh();
    expect(findOutlinerRowByName(container, 'SelectedObj').style.background).toBe(Theme.outlinerSelectedColor);
  });

  it('should not highlight unselected objects in the tree', () => {
    const meshA = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    meshA.name = 'Selected';
    const meshB = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    meshB.name = 'NotSelected';
    root.add(meshA);
    root.add(meshB);
    selectionManager.selectObject(meshA);
    panel.refresh();
    expect(findOutlinerRowByName(container, 'NotSelected').style.background).not.toBe(Theme.outlinerSelectedColor);
  });

  it('should select object on click of tree item', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.name = 'ClickedObj';
    root.add(mesh);
    panel.refresh();
    findOutlinerRowByName(container, 'ClickedObj').dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(selectionManager.isObjectSelected(mesh)).toBe(true);
  });

  it('should keep empty groups in hierarchy selection for grouping/delete', () => {
    const group = new THREE.Group();
    group.name = 'EmptyGroup';
    root.add(group);
    panel.refresh();
    findOutlinerRowByName(container, 'EmptyGroup').dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    const objects = panel.getObjectsForGrouping();
    expect(objects).toContain(group);
    expect(objects.length).toBe(1);
  });

  it('should highlight only a group row when the group is selected, not its children', () => {
    const group = new THREE.Group();
    group.name = 'ParentGroup';
    const child = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    child.name = 'ChildMesh';
    group.add(child);
    root.add(group);
    panel.refresh();
    clickOutlinerRowByName(container, 'ParentGroup');
    expect(findOutlinerRowBackground(container, 'ParentGroup')).toBe(Theme.outlinerSelectedColor);
    expect(findOutlinerRowBackground(container, 'ChildMesh')).not.toBe(Theme.outlinerSelectedColor);
    expect(selectionManager.getInspectorObjects()).toEqual([group]);
  });

  it('should highlight only a nested child group without parent group orange', () => {
    const outer = new THREE.Group();
    outer.name = 'OuterGroup';
    const inner = new THREE.Group();
    inner.name = 'InnerGroup';
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    leaf.name = 'LeafMesh';
    inner.add(leaf);
    outer.add(inner);
    root.add(outer);
    panel.refresh();
    clickOutlinerRowByName(container, 'InnerGroup');
    expect(findOutlinerRowBackground(container, 'InnerGroup')).toBe(Theme.outlinerSelectedColor);
    expect(findOutlinerRowBackground(container, 'OuterGroup')).not.toBe(Theme.outlinerSelectedColor);
    expect(findOutlinerRowBackground(container, 'LeafMesh')).not.toBe(Theme.outlinerSelectedColor);
    expect(selectionManager.getInspectorObjects()).toEqual([inner]);
  });

  it('should not orange parent groups when a nested mesh is selected in the viewport', () => {
    const outer = new THREE.Group();
    outer.name = 'OuterGroup';
    const inner = new THREE.Group();
    inner.name = 'InnerGroup';
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    leaf.name = 'LeafMesh';
    inner.add(leaf);
    outer.add(inner);
    root.add(outer);
    panel.refresh();
    selectionManager.selectObject(leaf);
    expect(findOutlinerRowBackground(container, 'LeafMesh')).toBe(Theme.outlinerSelectedColor);
    expect(findOutlinerRowBackground(container, 'InnerGroup')).not.toBe(Theme.outlinerSelectedColor);
    expect(findOutlinerRowBackground(container, 'OuterGroup')).not.toBe(Theme.outlinerSelectedColor);
  });

  it('should auto-refresh when selection changes', () => {
    const meshA = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    meshA.name = 'ObjA';
    const meshB = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    meshB.name = 'ObjB';
    root.add(meshA);
    root.add(meshB);
    selectionManager.selectObject(meshB);
    panel.refresh();
    expect(findOutlinerRowByName(container, 'ObjA').style.background).not.toBe(Theme.outlinerSelectedColor);
    expect(findOutlinerRowByName(container, 'ObjB').style.background).toBe(Theme.outlinerSelectedColor);
  });

  it('should clear tree on refresh with empty scene', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.name = 'TempObj';
    root.add(mesh);
    panel.refresh();
    root.remove(mesh);
    panel.refresh();
    const visibleRows = Array.from(container.querySelectorAll('.editor-outliner-row')).filter(
      (row) => (row as HTMLElement).style.display !== 'none',
    );
    expect(visibleRows.length).toBe(0);
  });

  it('should pass multi-selected hierarchy roots on reparent drop', () => {
    const meshA = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    meshA.name = 'Brush1';
    const meshB = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    meshB.name = 'Brush2';
    const group = new THREE.Group();
    group.name = 'Group';
    root.add(meshA);
    root.add(meshB);
    root.add(group);
    panel.refresh();
    let reparented: THREE.Object3D[] = [];
    panel.setReparentCallback((objects) => {
      reparented = [...objects];
    });
    clickOutlinerRowByName(container, 'Brush1');
    const brush2Row = findOutlinerRowByName(container, 'Brush2');
    brush2Row.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1, ctrlKey: true }));
    const transfer = {
      data: '',
      effectAllowed: 'all',
      dropEffect: 'move',
      setData(_type: string, value: string) {
        this.data = value;
      },
      getData() {
        return this.data;
      },
    };
    const brush1Row = findOutlinerRowByName(container, 'Brush1');
    const groupRow = findOutlinerRowByName(container, 'Group');
    brush1Row.getBoundingClientRect = () =>
      ({ top: 0, bottom: 20, left: 0, right: 100, width: 100, height: 20, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    groupRow.getBoundingClientRect = () =>
      ({
        top: 40,
        bottom: 60,
        left: 0,
        right: 100,
        width: 100,
        height: 20,
        x: 0,
        y: 40,
        toJSON: () => ({}),
      }) as DOMRect;
    const dragStart = new Event('dragstart', { bubbles: true }) as DragEvent;
    Object.defineProperty(dragStart, 'dataTransfer', { value: transfer });
    brush1Row.dispatchEvent(dragStart);
    const drop = new Event('drop', { bubbles: true }) as DragEvent;
    Object.defineProperty(drop, 'dataTransfer', { value: transfer });
    Object.defineProperty(drop, 'clientY', { value: 50 });
    Object.defineProperty(drop, 'clientX', { value: 40 });
    groupRow.dispatchEvent(drop);
    expect(reparented).toContain(meshA);
    expect(reparented).toContain(meshB);
    expect(reparented.length).toBe(2);
  });

  it('selects an unselected row through the edit gate before toggling its visibility', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.name = 'Gated';
    root.add(mesh);
    panel.refresh();
    panel.setVisibilityCallback((object) => (object.visible = !object.visible));
    const gate = vi.fn<OutlinerEditGate>((_object, select, apply) => {
      expect(select()).toBe(true);
      apply();
    });
    panel.editGateSet(gate);
    findOutlinerRowByName(container, 'Gated').querySelector<HTMLElement>('[title="Hide"]')?.click();
    expect(gate).toHaveBeenCalledWith(mesh, expect.any(Function), expect.any(Function), expect.any(Function));
    expect(selectionManager.isObjectSelected(mesh)).toBe(true);
    expect(mesh.visible).toBe(false);
  });

  it('leaves a row unchanged when the edit gate refuses', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.name = 'Refused';
    root.add(mesh);
    panel.refresh();
    const toggle = vi.fn();
    panel.setVisibilityCallback(toggle);
    panel.editGateSet((_object, _select, _apply, refused) => refused());
    findOutlinerRowByName(container, 'Refused').querySelector<HTMLElement>('[title="Hide"]')?.click();
    expect(toggle).not.toHaveBeenCalled();
    expect(selectionManager.isObjectSelected(mesh)).toBe(false);
  });

  it('should remove from DOM on dispose', () => {
    panel.dispose();
    expect(container.children.length).toBe(0);
  });
});

/**
 * Clicks the outliner row whose name span matches.
 *
 * @param host Parent element that contains the outliner panel DOM.
 * @param name Object display name.
 */
function clickOutlinerRowByName(host: HTMLElement, name: string): void {
  const row = findOutlinerRowByName(host, name);
  row.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
}

/**
 * Returns the selection background style of a named outliner row.
 *
 * @param host Parent element that contains the outliner panel DOM.
 * @param name Object display name.
 * @returns Row background CSS value.
 */
function findOutlinerRowBackground(host: HTMLElement, name: string): string {
  return findOutlinerRowByName(host, name).style.background;
}

/**
 * Finds the outliner row element for a display name.
 *
 * @param host Parent element that contains the outliner panel DOM.
 * @param name Object display name.
 * @returns Row element.
 */
function findOutlinerRowByName(host: HTMLElement, name: string): HTMLElement {
  const spans = host.querySelectorAll('span');
  for (const span of Array.from(spans)) {
    if (span.textContent === name) {
      const row = span.closest('div');
      if (row instanceof HTMLElement) return row;
    }
  }
  throw new Error(`Outliner row not found: ${name}`);
}
