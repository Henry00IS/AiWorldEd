import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { OutlinerItem } from '../../src/ui/outliner/outliner_item.js';

describe('OutlinerItem', () => {
  let container: HTMLElement;
  let mesh: THREE.Mesh;
  let item: OutlinerItem;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.name = 'TestCube';
    item = new OutlinerItem(mesh, 0, false);
  });

  afterEach(() => {
    item.dispose();
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  it('should create item with correct element', () => {
    const element = item.getElement();
    expect(element.tagName).toBe('DIV');
  });

  it('should return the associated object', () => {
    expect(item.getObject()).toBe(mesh);
  });

  it('should display the object name', () => {
    const element = item.getElement();
    container.appendChild(element);
    const nameSpan = element.querySelector('span:nth-child(3)') as HTMLSpanElement;
    expect(nameSpan.textContent).toBe('TestCube');
  });

  it('should apply selection highlight', () => {
    item.setSelectionState(true);
    const element = item.getElement();
    expect(element.style.background).toBe('rgba(232, 106, 23, 0.3)');
  });

  it('should remove selection highlight', () => {
    item.setSelectionState(false);
    const element = item.getElement();
    expect(element.style.background).toBe('transparent');
  });

  it('should update expanded chevron state', () => {
    const expandedItem = new OutlinerItem(mesh, 0, true);
    expandedItem.setExpandedState(true);
    const element = expandedItem.getElement();
    const chevron = element.querySelector('span:nth-child(1)') as HTMLElement;
    expect(chevron.textContent).toBe('▼');
    expandedItem.setExpandedState(false);
    expect(chevron.textContent).toBe('▶');
    expandedItem.dispose();
  });

  it('should hide chevron when hasChildren is false', () => {
    const element = item.getElement();
    const chevron = element.querySelector('span:nth-child(1)') as HTMLElement;
    expect(chevron.style.visibility).toBe('hidden');
  });

  it('should show visible eye icon by default', () => {
    const element = item.getElement();
    const visSpan = element.querySelector('span:nth-child(4)') as HTMLElement;
    expect(visSpan.textContent).toBe('👁');
  });

  it('should update visibility icon when toggled', () => {
    item.setVisibilityState(false);
    const element = item.getElement();
    const visSpan = element.querySelector('span:nth-child(4)') as HTMLElement;
    expect(visSpan.textContent).toBe('👁‍🗨');
  });

  it('should show unlocked lock icon by default', () => {
    const element = item.getElement();
    const lockSpan = element.querySelector('span:nth-child(5)') as HTMLElement;
    expect(lockSpan.textContent).toBe('🔓');
  });

  it('should update lock icon when toggled', () => {
    item.setLockState(true);
    const element = item.getElement();
    const lockSpan = element.querySelector('span:nth-child(5)') as HTMLElement;
    expect(lockSpan.textContent).toBe('🔒');
  });

  it('should fire lock callback on lock icon click', () => {
    let lockedObj: THREE.Object3D | null = null;
    item.onLockToggle((obj) => {
      lockedObj = obj;
    });
    const element = item.getElement();
    container.appendChild(element);
    const lockSpan = element.querySelector('span:nth-child(5)') as HTMLElement;
    lockSpan.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(lockedObj).toBe(mesh);
  });

  it('should fire selection callback on click', () => {
    let selectedObj: THREE.Object3D | null = null;
    item.onSelection((obj) => { selectedObj = obj; });
    const element = item.getElement();
    container.appendChild(element);
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(selectedObj).toBe(mesh);
  });

  it('should fire visibility callback on visibility icon click', () => {
    let toggledObj: THREE.Object3D | null = null;
    item.onVisibilityToggle((obj) => { toggledObj = obj; });
    const element = item.getElement();
    container.appendChild(element);
    const visSpan = element.querySelector('span:nth-child(4)') as HTMLElement;
    visSpan.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(toggledObj).toBe(mesh);
  });

  it('should fire expand callback on chevron click', () => {
    let expandedObj: THREE.Object3D | null = null;
    const expandedItem = new OutlinerItem(mesh, 0, true);
    expandedItem.onExpandToggle((obj) => { expandedObj = obj; });
    const element = expandedItem.getElement();
    container.appendChild(element);
    const chevron = element.querySelector('span:nth-child(1)') as HTMLElement;
    chevron.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(expandedObj).toBe(mesh);
    expandedItem.dispose();
  });

  it('should fire context menu callback on right click', () => {
    let contextObj: THREE.Object3D | null = null;
    let contextX = 0;
    let contextY = 0;
    item.onContextMenuRequest((obj, x, y) => {
      contextObj = obj;
      contextX = x;
      contextY = y;
    });
    const element = item.getElement();
    container.appendChild(element);
    element.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      clientX: 100,
      clientY: 200
    }));
    expect(contextObj).toBe(mesh);
    expect(contextX).toBe(100);
    expect(contextY).toBe(200);
  });

  it('should apply indentation based on depth', () => {
    const deepItem = new OutlinerItem(mesh, 3, false);
    const element = deepItem.getElement();
    expect(element.style.paddingLeft).toBe('52px');
    deepItem.dispose();
  });

  it('should remove element from DOM on dispose', () => {
    const element = item.getElement();
    container.appendChild(element);
    expect(container.contains(element)).toBe(true);
    item.dispose();
    expect(container.contains(element)).toBe(false);
  });
});
