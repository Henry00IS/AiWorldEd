import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { OutlinerTree } from '../../src/ui/outliner/outliner_tree.js';

describe('OutlinerTree', () => {
  let container: HTMLElement;
  let root: THREE.Group;
  let tree: OutlinerTree;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = new THREE.Group();
    root.name = 'SceneRoot';
    tree = new OutlinerTree(container, root);
  });

  afterEach(() => {
    tree.dispose();
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  it('should create tree and append to container', () => {
    expect(container.children.length).toBe(2);
    expect(container.children[0].tagName).toBe('INPUT');
    expect(container.children[1].tagName).toBe('DIV');
  });

  it('should return the root object', () => {
    expect(tree.getRoot()).toBe(root);
  });

  it('should render children of root', () => {
    const mesh1 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh1.name = 'Cube1';
    const mesh2 = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 8), new THREE.MeshBasicMaterial());
    mesh2.name = 'Sphere1';
    root.add(mesh1);
    root.add(mesh2);
    tree.refresh(new Set());
    const treeElement = container.children[1] as HTMLElement;
    expect(treeElement.children.length).toBe(2);
  });

  it('should hide decorative edges and selection outlines under meshes', () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    );
    mesh.name = 'CubeWithHelpers';
    const decorative = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial()
    );
    decorative.name = 'DecorativeEdge';
    decorative.userData.isDecorativeEdge = true;
    const outline = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial()
    );
    outline.name = 'SelectionOutline';
    outline.userData.isSelectionHighlight = true;
    const realChild = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.5, 0.5),
      new THREE.MeshBasicMaterial()
    );
    realChild.name = 'RealChild';
    mesh.add(decorative);
    mesh.add(outline);
    mesh.add(realChild);
    root.add(mesh);
    tree.refresh(new Set());
    tree.toggleExpand(mesh);
    const treeElement = container.children[1] as HTMLElement;
    const text = treeElement.textContent || '';
    expect(text).toContain('CubeWithHelpers');
    expect(text).toContain('RealChild');
    expect(text).not.toContain('DecorativeEdge');
    expect(text).not.toContain('SelectionOutline');
  });

  it('should not show expand chevron when mesh only has editor helper children', () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    );
    mesh.name = 'LeafCube';
    const decorative = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial()
    );
    decorative.userData.isDecorativeEdge = true;
    mesh.add(decorative);
    root.add(mesh);
    tree.refresh(new Set());
    const treeElement = container.children[1] as HTMLElement;
    expect(treeElement.children.length).toBe(1);
    tree.toggleExpand(mesh);
    expect(treeElement.children.length).toBe(1);
  });

  it('should select object on callback registration', () => {
    let selectedObj: THREE.Object3D | null = null;
    tree.onSelectObject((obj) => { selectedObj = obj; });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.name = 'Selectable';
    root.add(mesh);
    tree.refresh(new Set());
    const treeElement = container.children[1] as HTMLElement;
    const firstItem = treeElement.children[0] as HTMLElement;
    firstItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(selectedObj).toBe(mesh);
  });

  it('should toggle visibility on callback registration', () => {
    let toggledObj: THREE.Object3D | null = null;
    tree.onToggleVisibility((obj) => { toggledObj = obj; });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.name = 'Visible';
    root.add(mesh);
    tree.refresh(new Set());
    const treeElement = container.children[1] as HTMLElement;
    const firstItem = treeElement.children[0] as HTMLElement;
    const visIcon = firstItem.querySelector('span:nth-child(4)') as HTMLElement;
    visIcon.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(toggledObj).toBe(mesh);
  });

  it('should highlight selected objects', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.name = 'Selected';
    root.add(mesh);
    const selectionSet = new Set<THREE.Mesh>();
    selectionSet.add(mesh);
    tree.refresh(selectionSet);
    const treeElement = container.children[1] as HTMLElement;
    expect(treeElement.children[0].style.background).toBe('rgba(232, 106, 23, 0.3)');
  });

  it('should not highlight unselected objects', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.name = 'NotSelected';
    root.add(mesh);
    tree.refresh(new Set());
    const treeElement = container.children[1] as HTMLElement;
    expect(treeElement.children[0].style.background).toBe('transparent');
  });

  it('should filter objects by search query', () => {
    const meshA = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    meshA.name = 'Apple';
    const meshB = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 8), new THREE.MeshBasicMaterial());
    meshB.name = 'Banana';
    root.add(meshA);
    root.add(meshB);
    const searchInput = container.children[0] as HTMLInputElement;
    searchInput.value = 'App';
    searchInput.dispatchEvent(new Event('input'));
    const treeElement = container.children[1] as HTMLElement;
    expect(treeElement.children.length).toBe(1);
  });

  it('should show all objects when search is cleared', () => {
    const meshA = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    meshA.name = 'Apple';
    const meshB = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 8), new THREE.MeshBasicMaterial());
    meshB.name = 'Banana';
    root.add(meshA);
    root.add(meshB);
    const searchInput = container.children[0] as HTMLInputElement;
    searchInput.value = 'App';
    searchInput.dispatchEvent(new Event('input'));
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input'));
    const treeElement = container.children[1] as HTMLElement;
    expect(treeElement.children.length).toBe(2);
  });

  it('should show search bar with placeholder', () => {
    const searchInput = container.children[0] as HTMLInputElement;
    expect(searchInput.placeholder).toBe('Search...');
  });

  it('should return search query', () => {
    const searchInput = container.children[0] as HTMLInputElement;
    searchInput.value = 'TestQuery';
    searchInput.dispatchEvent(new Event('input'));
    expect(tree.getSearchQuery()).toBe('TestQuery');
  });

  it('should expand and collapse children', () => {
    const childGroup = new THREE.Group();
    childGroup.name = 'ChildGroup';
    const grandchild = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    );
    grandchild.name = 'Grandchild';
    childGroup.add(grandchild);
    root.add(childGroup);
    tree.toggleExpand(childGroup);
    const treeElement = container.children[1] as HTMLElement;
    expect(treeElement.children.length).toBe(2);
    tree.toggleExpand(childGroup);
    expect(treeElement.children.length).toBe(1);
    tree.toggleExpand(childGroup);
    expect(treeElement.children.length).toBe(2);
  });

  it('should remove elements on dispose', () => {
    tree.dispose();
    expect(container.children.length).toBe(0);
  });
});
