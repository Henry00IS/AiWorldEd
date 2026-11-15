import { themeCssResolveDarkStyleValue } from '@/ui/theme/theme_ui_css_resolve.js';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { OutlinerTree } from '@/outliner/ui/outliner_tree.js';

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
    expect(container.children[0]!.tagName).toBe('INPUT');
    expect(container.children[1]!.tagName).toBe('DIV');
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
    expect(tree.getVisibleRowCountForTests()).toBe(2);
    expect(tree.getRowElementsForTests().length).toBeGreaterThan(0);
  });

  it('should hide decorative edges and selection outlines under meshes', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.name = 'CubeWithHelpers';
    const decorative = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
    decorative.name = 'DecorativeEdge';
    decorative.userData['isDecorativeEdge'] = true;
    const outline = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
    outline.name = 'SelectionOutline';
    outline.userData['isSelectionHighlight'] = true;
    const realChild = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshBasicMaterial());
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
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.name = 'LeafCube';
    const decorative = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
    decorative.userData['isDecorativeEdge'] = true;
    mesh.add(decorative);
    root.add(mesh);
    tree.refresh(new Set());
    expect(tree.getVisibleRowCountForTests()).toBe(1);
    tree.toggleExpand(mesh);
    expect(tree.getVisibleRowCountForTests()).toBe(1);
  });

  it('should select object on callback registration', () => {
    let selectedObj: THREE.Object3D | null = null;
    tree.onSelectObject((obj) => {
      selectedObj = obj;
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.name = 'Selectable';
    root.add(mesh);
    tree.refresh(new Set());
    const firstItem = tree.getRowElementsForTests()[0]!;
    firstItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(selectedObj).toBe(mesh);
  });

  it('should toggle visibility on callback registration', () => {
    let toggledObj: THREE.Object3D | null = null;
    tree.onToggleVisibility((obj) => {
      toggledObj = obj;
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.name = 'Visible';
    root.add(mesh);
    tree.refresh(new Set());
    const firstItem = tree.getRowElementsForTests()[0]!;
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
    expect(themeCssResolveDarkStyleValue('background', tree.getRowElementsForTests()[0]!.style.background)).toBe(
      'rgba(232, 106, 23, 0.3)',
    );
  });

  it('should not highlight unselected objects', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.name = 'NotSelected';
    root.add(mesh);
    tree.refresh(new Set());
    expect(tree.getRowElementsForTests()[0]!.style.background).toBe('transparent');
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
    expect(tree.getVisibleRowCountForTests()).toBe(1);
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
    expect(tree.getVisibleRowCountForTests()).toBe(2);
  });

  it('keeps scene selection highlight after search hides then shows the selected row', () => {
    const meshA = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    meshA.name = 'Apple';
    const meshB = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 8), new THREE.MeshBasicMaterial());
    meshB.name = 'Banana';
    root.add(meshA);
    root.add(meshB);
    const selection = new Set<THREE.Mesh>([meshB]);
    tree.refresh(selection);
    const searchInput = container.children[0] as HTMLInputElement;
    searchInput.value = 'App';
    searchInput.dispatchEvent(new Event('input'));
    expect(tree.getVisibleRowCountForTests()).toBe(1);
    expect(tree.getRowElementsForTests()[0]!.style.background).toBe('transparent');
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input'));
    expect(tree.getVisibleRowCountForTests()).toBe(2);
    const bananaRow = tree.getRowElementsForTests().find((row) => row.textContent?.includes('Banana'));
    expect(themeCssResolveDarkStyleValue('background', bananaRow?.style.background ?? '')).toBe(
      'rgba(232, 106, 23, 0.3)',
    );
  });

  it('reuses matching row elements while refining the search query', () => {
    const meshA = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    meshA.name = 'Apple';
    const meshB = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 8), new THREE.MeshBasicMaterial());
    meshB.name = 'Banana';
    root.add(meshA);
    root.add(meshB);
    tree.refresh(new Set());
    const searchInput = container.children[0] as HTMLInputElement;
    searchInput.value = 'B';
    searchInput.dispatchEvent(new Event('input'));
    const bananaRowBefore = tree.getRowElementsForTests()[0]!;
    expect(bananaRowBefore.textContent).toContain('Banana');
    searchInput.value = 'Bana';
    searchInput.dispatchEvent(new Event('input'));
    expect(tree.getRowElementsForTests()[0]).toBe(bananaRowBefore);
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

  it('should expand groups by default when they first appear with children', () => {
    const childGroup = new THREE.Group();
    childGroup.name = 'ChildGroup';
    const grandchild = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    grandchild.name = 'Grandchild';
    childGroup.add(grandchild);
    root.add(childGroup);
    tree.refresh(new Set());
    expect(tree.getVisibleRowCountForTests()).toBe(2);
  });

  it('should expand and collapse children', () => {
    const childGroup = new THREE.Group();
    childGroup.name = 'ChildGroup';
    const grandchild = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    grandchild.name = 'Grandchild';
    childGroup.add(grandchild);
    root.add(childGroup);
    tree.refresh(new Set());
    expect(tree.getVisibleRowCountForTests()).toBe(2);
    tree.toggleExpand(childGroup);
    expect(tree.getVisibleRowCountForTests()).toBe(1);
    tree.toggleExpand(childGroup);
    expect(tree.getVisibleRowCountForTests()).toBe(2);
  });

  it('should keep a duplicated group closed when the source group is closed', () => {
    const sourceGroup = new THREE.Group();
    sourceGroup.name = 'ClosedGroup';
    const child = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    child.name = 'Child';
    sourceGroup.add(child);
    root.add(sourceGroup);
    tree.refresh(new Set());
    expect(tree.getVisibleRowCountForTests()).toBe(2);
    tree.toggleExpand(sourceGroup);
    expect(tree.getVisibleRowCountForTests()).toBe(1);
    expect(tree.isExpandedUuid(sourceGroup.uuid)).toBe(false);
    const cloneGroup = new THREE.Group();
    cloneGroup.name = 'ClosedGroup.001';
    const cloneChild = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    cloneChild.name = 'Child.001';
    cloneGroup.add(cloneChild);
    root.add(cloneGroup);
    tree.copyExpandStateFromSource(sourceGroup, cloneGroup);
    // Revealing the group root (post-duplicate selection) must not open it.
    tree.revealObject(cloneGroup, new Set([cloneChild]), new Set([cloneGroup]));
    tree.refresh(new Set([cloneChild]), new Set([cloneGroup]));
    expect(tree.isExpandedUuid(cloneGroup.uuid)).toBe(false);
    expect(tree.getVisibleRowCountForTests()).toBe(2);
  });

  it('should keep a duplicated group open when the source group is open', () => {
    const sourceGroup = new THREE.Group();
    sourceGroup.name = 'OpenGroup';
    const child = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    child.name = 'Child';
    sourceGroup.add(child);
    root.add(sourceGroup);
    tree.refresh(new Set());
    expect(tree.isExpandedUuid(sourceGroup.uuid)).toBe(true);
    const cloneGroup = new THREE.Group();
    cloneGroup.name = 'OpenGroup.001';
    const cloneChild = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    cloneChild.name = 'Child.001';
    cloneGroup.add(cloneChild);
    root.add(cloneGroup);
    tree.copyExpandStateFromSource(sourceGroup, cloneGroup);
    tree.refresh(new Set());
    expect(tree.isExpandedUuid(cloneGroup.uuid)).toBe(true);
    expect(tree.getVisibleRowCountForTests()).toBe(4);
  });

  it('should restore closed state after a child reveal expands the clone', () => {
    const sourceGroup = new THREE.Group();
    sourceGroup.name = 'ClosedGroup';
    const child = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    sourceGroup.add(child);
    root.add(sourceGroup);
    tree.refresh(new Set());
    tree.toggleExpand(sourceGroup);
    const cloneGroup = new THREE.Group();
    const cloneChild = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    cloneGroup.add(cloneChild);
    root.add(cloneGroup);
    tree.copyExpandStateFromSource(sourceGroup, cloneGroup);
    // Child-focused reveal expands the closed clone (selection of brushes).
    tree.revealObject(cloneChild, new Set([cloneChild]), new Set([cloneGroup]));
    expect(tree.isExpandedUuid(cloneGroup.uuid)).toBe(true);
    // Post-duplicate re-mirror closes it again.
    tree.copyExpandStateFromSource(sourceGroup, cloneGroup);
    tree.refresh(new Set());
    expect(tree.isExpandedUuid(cloneGroup.uuid)).toBe(false);
  });

  it('should hide expand chevron when last child leaves a group without list length change', () => {
    const group = new THREE.Group();
    group.name = 'Emptyable';
    const child = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    child.name = 'OnlyChild';
    const sibling = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    sibling.name = 'Sibling';
    group.add(child);
    root.add(group);
    root.add(sibling);
    tree.refresh(new Set());
    const groupRow = tree.getRowElementsForTests()[0]!;
    const groupChevron = groupRow.querySelector('span:nth-child(1)') as HTMLElement;
    expect(groupChevron.style.visibility).not.toBe('hidden');
    group.remove(child);
    const insertIndex = root.children.indexOf(group) + 1;
    root.children.splice(insertIndex, 0, child);
    child.parent = root;
    tree.refresh(new Set());
    expect(tree.getVisibleRowCountForTests()).toBe(3);
    expect(groupChevron.style.visibility).toBe('hidden');
  });

  it('should remove elements on dispose', () => {
    tree.dispose();
    expect(container.children.length).toBe(0);
  });

  it('should insert a single added root child without dropping existing rows', () => {
    const meshA = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    meshA.name = 'CubeA';
    const meshB = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    meshB.name = 'CubeB';
    root.add(meshA);
    root.add(meshB);
    tree.refresh(new Set());
    const firstRow = tree.getRowElementsForTests()[0]!;
    expect(tree.getVisibleRowCountForTests()).toBe(2);

    const meshC = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    meshC.name = 'CubeC';
    root.add(meshC);
    tree.refresh(new Set());

    expect(tree.getVisibleRowCountForTests()).toBe(3);
    expect(tree.getRowElementsForTests()[0]).toBe(firstRow);
    expect(container.textContent).toContain('CubeC');
  });

  it('should remove a single deleted root child without rebuilding siblings', () => {
    const meshA = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    meshA.name = 'KeepA';
    const meshB = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    meshB.name = 'RemoveMe';
    const meshC = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    meshC.name = 'KeepC';
    root.add(meshA);
    root.add(meshB);
    root.add(meshC);
    tree.refresh(new Set());
    const firstRow = tree.getRowElementsForTests()[0]!;
    const poolSizeBefore = tree.getPoolSizeForTests();

    root.remove(meshB);
    tree.refresh(new Set());

    expect(tree.getVisibleRowCountForTests()).toBe(2);
    expect(tree.getRowElementsForTests()[0]).toBe(firstRow);
    expect(tree.getPoolSizeForTests()).toBe(poolSizeBefore);
    expect(container.textContent).not.toContain('RemoveMe');
    expect(container.textContent).toContain('KeepA');
    expect(container.textContent).toContain('KeepC');
  });

  it('should keep DOM pool size bounded for large hierarchies', () => {
    for (let index = 0; index < 300; index += 1) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
      mesh.name = `Mesh${index}`;
      root.add(mesh);
    }
    tree.refresh(new Set());
    expect(tree.getVisibleRowCountForTests()).toBe(300);
    expect(tree.getPoolSizeForTests()).toBeLessThan(80);
    expect(tree.getPoolSizeForTests()).toBeGreaterThan(0);
  });

  it('should show a one-pixel insert line when dragging one row over another', () => {
    const meshA = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    meshA.name = 'DragSource';
    const meshB = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    meshB.name = 'DropTarget';
    root.add(meshA);
    root.add(meshB);
    tree.refresh(new Set());
    const treeElement = container.children[1] as HTMLElement;
    const rows = tree.getRowElementsForTests();
    const sourceRow = rows[0]!;
    const targetRow = rows[1]!;
    targetRow.getBoundingClientRect = () =>
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
    treeElement.getBoundingClientRect = () =>
      ({
        top: 0,
        bottom: 200,
        left: 0,
        right: 100,
        width: 100,
        height: 200,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    Object.defineProperty(treeElement, 'clientWidth', { value: 100, configurable: true });
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
    const dragStart = new Event('dragstart', { bubbles: true }) as DragEvent;
    Object.defineProperty(dragStart, 'dataTransfer', { value: transfer });
    sourceRow.dispatchEvent(dragStart);
    const dragOver = new Event('dragover', { bubbles: true }) as DragEvent;
    Object.defineProperty(dragOver, 'dataTransfer', { value: transfer });
    Object.defineProperty(dragOver, 'clientY', { value: 55 });
    Object.defineProperty(dragOver, 'clientX', { value: 8 });
    targetRow.dispatchEvent(dragOver);
    const indicator = tree.getInsertIndicatorForTests();
    expect(indicator.style.display).toBe('block');
    expect(indicator.style.height).toBe('1px');
    expect(indicator.parentElement).toBe(treeElement);
  });

  it('should elevate drop after an expanded solid when pointer is left of brush indent', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.name = 'LooseMesh';
    const solid = new THREE.Group();
    solid.name = 'SolidModel';
    const brush = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    brush.name = 'Brush';
    solid.add(brush);
    root.add(mesh);
    root.add(solid);
    tree.refresh(new Set());
    let reparentArgs: { target: THREE.Object3D; placement: string } | null = null;
    tree.onReparentObject((_dragged, target, placement) => {
      reparentArgs = { target, placement };
    });
    const treeElement = container.children[1] as HTMLElement;
    const rows = tree.getRowElementsForTests();
    const meshRow = rows[0]!;
    const brushRow = rows.find((row) => row.textContent?.includes('Brush'));
    expect(brushRow).toBeTruthy();
    brushRow!.getBoundingClientRect = () =>
      ({
        top: 40,
        bottom: 60,
        left: 20,
        right: 120,
        width: 100,
        height: 20,
        x: 20,
        y: 40,
        toJSON: () => ({}),
      }) as DOMRect;
    treeElement.getBoundingClientRect = () =>
      ({
        top: 0,
        bottom: 200,
        left: 0,
        right: 200,
        width: 200,
        height: 200,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
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
    const dragStart = new Event('dragstart', { bubbles: true }) as DragEvent;
    Object.defineProperty(dragStart, 'dataTransfer', { value: transfer });
    meshRow.dispatchEvent(dragStart);
    const drop = new Event('drop', { bubbles: true }) as DragEvent;
    Object.defineProperty(drop, 'dataTransfer', { value: transfer });
    Object.defineProperty(drop, 'clientY', { value: 55 });
    Object.defineProperty(drop, 'clientX', { value: 6 });
    brushRow!.dispatchEvent(drop);
    expect(reparentArgs).not.toBeNull();
    expect(reparentArgs!.target).toBe(solid);
    expect(reparentArgs!.placement).toBe('after');
  });
});
