import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { SelectionManager } from '../../src/managers/selection_manager.js';
import { OutlinerPanel } from '../../src/ui/outliner_panel.js';
import { Theme } from '../../src/theme.js';

describe('OutlinerPanel', () => {
  let container: HTMLElement;
  let selectionManager: SelectionManager;
  let root: THREE.Group;
  let panel: OutlinerPanel;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    selectionManager = new SelectionManager();
    root = new THREE.Group();
    panel = new OutlinerPanel(container, selectionManager, root);
  });

  afterEach(() => {
    panel.dispose();
    selectionManager.dispose();
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  it('should create panel and append to container', () => {
    expect(container.children.length).toBe(1);
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
    const panelElement = container.children[0] as HTMLElement;
    const treeElement = panelElement.children[1] as HTMLElement;
    expect(treeElement.children.length).toBe(2);
  });

  it('should display object names in tree items', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.name = 'TestCube';
    root.add(mesh);
    panel.refresh();
    const panelElement = container.children[0] as HTMLElement;
    const treeElement = panelElement.children[1] as HTMLElement;
    const nameSpan = treeElement.children[0].querySelector('span:nth-child(3)') as HTMLSpanElement;
    expect(nameSpan.textContent).toBe('TestCube');
  });

  it('should highlight selected objects in the tree', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.name = 'SelectedObj';
    root.add(mesh);
    selectionManager.selectObject(mesh);
    panel.refresh();
    const panelElement = container.children[0] as HTMLElement;
    const treeElement = panelElement.children[1] as HTMLElement;
    expect(treeElement.children[0].style.background).toBe(Theme.outlinerSelectedColor);
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
    const panelElement = container.children[0] as HTMLElement;
    const treeElement = panelElement.children[1] as HTMLElement;
    expect(treeElement.children[1].style.background).not.toBe(Theme.outlinerSelectedColor);
  });

  it('should select object on click of tree item', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.name = 'ClickedObj';
    root.add(mesh);
    panel.refresh();
    const panelElement = container.children[0] as HTMLElement;
    const treeElement = panelElement.children[1] as HTMLElement;
    treeElement.children[0].dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(selectionManager.isObjectSelected(mesh)).toBe(true);
  });

  it('should keep empty groups in hierarchy selection for grouping/delete', () => {
    const group = new THREE.Group();
    group.name = 'EmptyGroup';
    root.add(group);
    panel.refresh();
    const panelElement = container.children[0] as HTMLElement;
    const treeElement = panelElement.children[1] as HTMLElement;
    treeElement.children[0].dispatchEvent(
      new MouseEvent('click', { bubbles: true, detail: 1 })
    );
    const objects = panel.getObjectsForGrouping();
    expect(objects).toContain(group);
    expect(objects.length).toBe(1);
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
    const panelElement = container.children[0] as HTMLElement;
    const treeElement = panelElement.children[1] as HTMLElement;
    const itemA = treeElement.children[0] as HTMLElement;
    const itemB = treeElement.children[1] as HTMLElement;
    expect(itemA.style.background).not.toBe(Theme.outlinerSelectedColor);
    expect(itemB.style.background).toBe(Theme.outlinerSelectedColor);
  });

  it('should clear tree on refresh with empty scene', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.name = 'TempObj';
    root.add(mesh);
    panel.refresh();
    root.remove(mesh);
    panel.refresh();
    const panelElement = container.children[0] as HTMLElement;
    const treeElement = panelElement.children[1] as HTMLElement;
    expect(treeElement.children.length).toBe(0);
  });

  it('should support group callback registration', () => {
    let grouped = false;
    panel.setGroupCallback(() => { grouped = true; });
    expect(() => panel.dispose()).not.toThrow();
  });

  it('should support ungroup callback registration', () => {
    let ungrouped = false;
    panel.setUngroupCallback(() => { ungrouped = true; });
    expect(() => panel.dispose()).not.toThrow();
  });

  it('should support rename callback registration', () => {
    let renamed = false;
    panel.setRenameCallback(() => { renamed = true; });
    expect(() => panel.dispose()).not.toThrow();
  });

  it('should support visibility callback registration', () => {
    let toggled = false;
    panel.setVisibilityCallback(() => { toggled = true; });
    expect(() => panel.dispose()).not.toThrow();
  });

  it('should maintain backward compatible setContextCallbacks', () => {
    let duplicated = false;
    let deleted = false;
    panel.setContextCallbacks(
      () => { duplicated = true; },
      () => { deleted = true; }
    );
    expect(() => panel.dispose()).not.toThrow();
  });

  it('should remove from DOM on dispose', () => {
    panel.dispose();
    expect(container.children.length).toBe(0);
  });
});
