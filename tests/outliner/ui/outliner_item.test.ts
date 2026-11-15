import { themeCssResolveDarkStyleValue } from '@/ui/theme/theme_ui_css_resolve.js';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { OutlinerItem } from '@/outliner/ui/outliner_item.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { markAsSolidCsgGroup, setSolidGroupOperation } from '@/solid/model/solid_group.js';

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
    const nameSpan = item.getNameElement();
    expect(nameSpan.textContent).toBe('TestCube');
  });

  it('should select only the base name when renaming an auto hex id row', () => {
    mesh.name = 'Brush.00A';
    item.rebindObject(mesh, 0, false);
    container.appendChild(item.getElement());
    item.startRename();
    const input = item.getElement().querySelector('input') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.value).toBe('Brush.00A');
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe('Brush'.length);
  });

  it('should select the full name when renaming a row without auto hex id', () => {
    mesh.name = 'Custom.Name';
    item.rebindObject(mesh, 0, false);
    container.appendChild(item.getElement());
    item.startRename();
    const input = item.getElement().querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('Custom.Name');
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe('Custom.Name'.length);
  });

  it('should dim the hex id suffix of auto hierarchy names', () => {
    mesh.name = 'Brush.00A';
    item.rebindObject(mesh, 0, false);
    const nameSpan = item.getNameElement();
    const base = nameSpan.children[0] as HTMLSpanElement;
    const id = nameSpan.children[1] as HTMLSpanElement;
    expect(base.textContent).toBe('Brush');
    expect(id.textContent).toBe('.00A');
    expect(themeCssResolveDarkStyleValue('color', id.style.color)).toBe('rgb(106, 106, 106)');
    expect(nameSpan.textContent).toBe('Brush.00A');
  });

  it('should ellipsize long names with overflow styles', () => {
    const element = item.getElement();
    const nameSpan = item.getNameElement();
    expect(nameSpan.style.overflow).toBe('hidden');
    expect(nameSpan.style.textOverflow).toBe('ellipsis');
    expect(nameSpan.style.whiteSpace).toBe('nowrap');
    expect(nameSpan.style.minWidth === '0' || nameSpan.style.minWidth === '0px').toBe(true);
    expect(element.style.overflow).toBe('hidden');
    expect(element.style.minWidth === '0' || element.style.minWidth === '0px').toBe(true);
  });

  it('should apply selection highlight', () => {
    item.setSelectionState(true);
    const element = item.getElement();
    expect(themeCssResolveDarkStyleValue('background', element.style.background)).toBe('rgba(232, 106, 23, 0.3)');
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
    expect(chevron.textContent).toBe('▶');
    expect(chevron.style.transform).toBe('rotate(90deg)');
    expandedItem.setExpandedState(false);
    expect(chevron.textContent).toBe('▶');
    expect(chevron.style.transform).toBe('rotate(0deg)');
    expandedItem.dispose();
  });

  it('should hide chevron when hasChildren is false', () => {
    const element = item.getElement();
    const chevron = element.querySelector('span:nth-child(1)') as HTMLElement;
    expect(chevron.style.visibility).toBe('hidden');
  });

  it('should hide chevron when setHasChildren becomes false after having children', () => {
    const expandedItem = new OutlinerItem(mesh, 0, true);
    expandedItem.setExpandedState(true);
    const element = expandedItem.getElement();
    const chevron = element.querySelector('span:nth-child(1)') as HTMLElement;
    expect(chevron.style.visibility).not.toBe('hidden');
    expect(chevron.textContent).toBe('▶');
    expect(chevron.style.transform).toBe('rotate(90deg)');
    expandedItem.setHasChildren(false);
    expect(chevron.style.visibility).toBe('hidden');
    expect(chevron.textContent).toBe('');
    expandedItem.setHasChildren(true);
    expandedItem.setExpandedState(false);
    expect(chevron.style.visibility).toBe('visible');
    expect(chevron.textContent).toBe('▶');
    expect(chevron.style.transform).toBe('rotate(0deg)');
    expandedItem.dispose();
  });

  it('should show visible open-eye SVG by default', () => {
    const element = item.getElement();
    const visSpan = element.querySelector('span:nth-child(4)') as HTMLElement;
    const svg = visSpan.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(visSpan.innerHTML).toContain('stroke="currentColor"');
    expect(visSpan.innerHTML).not.toContain('#e74c3c');
    expect(visSpan.title).toBe('Hide');
  });

  it('should update visibility icon to eye with red slash when hidden', () => {
    item.setVisibilityState(false);
    const element = item.getElement();
    const visSpan = element.querySelector('span:nth-child(4)') as HTMLElement;
    expect(visSpan.querySelector('svg')).not.toBeNull();
    expect(visSpan.innerHTML).toContain('#e74c3c');
    expect(visSpan.innerHTML).toContain('M4 4l16 16');
    expect(visSpan.title).toBe('Show');
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
    item.onSelection((obj) => {
      selectedObj = obj;
    });
    const element = item.getElement();
    container.appendChild(element);
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(selectedObj).toBe(mesh);
  });

  it('should fire visibility callback on visibility icon click', () => {
    let toggledObj: THREE.Object3D | null = null;
    item.onVisibilityToggle((obj) => {
      toggledObj = obj;
    });
    const element = item.getElement();
    container.appendChild(element);
    const visSpan = element.querySelector('span:nth-child(4)') as HTMLElement;
    visSpan.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(toggledObj).toBe(mesh);
  });

  it('should fire expand callback on chevron click', () => {
    let expandedObj: THREE.Object3D | null = null;
    const expandedItem = new OutlinerItem(mesh, 0, true);
    expandedItem.onExpandToggle((obj) => {
      expandedObj = obj;
    });
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
    element.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        clientX: 100,
        clientY: 200,
      }),
    );
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

  it('should show an operation-colored CSS brush dot with stable geometry', () => {
    const brush = SolidBrushVisual.createBoxPreview('OpBrush', 2, SolidOperation.Subtractive);
    const brushItem = new OutlinerItem(brush, 0, false);
    const row = brushItem.getElement();
    expect(row.style.alignItems).toBe('center');
    expect(row.style.height).toBe('22px');
    const iconRoot = row.children[1] as HTMLElement;
    const glyph = iconRoot.children[0] as HTMLElement;
    expect(glyph.textContent).toBe('');
    expect(glyph.style.backgroundColor).toBe('rgb(192, 57, 43)');
    expect(glyph.style.borderRadius).toBe('50%');
    expect(glyph.style.width).toBe('8px');
    expect(glyph.style.height).toBe('8px');
    expect(glyph.style.position).toBe('absolute');
    expect(glyph.style.left).toBe('50%');
    expect(glyph.style.top).toBe('calc(50% + 1px)');
    expect(glyph.style.transform).toBe('translate(-50%, -50%)');
    expect(themeCssResolveDarkStyleValue('boxShadow', glyph.style.boxShadow)).toBe('0 0 0 1px rgba(0, 0, 0, 0.35)');
    brushItem.dispose();
  });

  it('should place green red and blue brush dots on matching geometry', () => {
    const additive = SolidBrushVisual.createBoxPreview('Add', 2, SolidOperation.Additive);
    const subtractive = SolidBrushVisual.createBoxPreview('Sub', 2, SolidOperation.Subtractive);
    const intersecting = SolidBrushVisual.createBoxPreview('Int', 2, SolidOperation.Intersecting);
    const items = [
      new OutlinerItem(additive, 0, false),
      new OutlinerItem(subtractive, 0, false),
      new OutlinerItem(intersecting, 0, false),
    ];
    const glyphs = items.map((item) => {
      const iconRoot = item.getElement().children[1] as HTMLElement;
      return iconRoot.children[0] as HTMLElement;
    });
    const shared = {
      position: 'absolute',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      margin: '0px',
      fontSize: '0px',
      lineHeight: '0',
      boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.35)',
    };
    for (const glyph of glyphs) {
      expect(glyph.style.position).toBe(shared.position);
      expect(glyph.style.left).toBe(shared.left);
      expect(glyph.style.transform).toBe(shared.transform);
      expect(glyph.style.width).toBe(shared.width);
      expect(glyph.style.height).toBe(shared.height);
      expect(glyph.style.borderRadius).toBe(shared.borderRadius);
      expect(themeCssResolveDarkStyleValue('boxShadow', glyph.style.boxShadow)).toBe(shared.boxShadow);
    }
    expect(glyphs[0]!.style.top).toBe('50%');
    expect(glyphs[1]!.style.top).toBe('calc(50% + 1px)');
    expect(glyphs[2]!.style.top).toBe('50%');
    for (const item of items) {
      item.dispose();
    }
  });

  it('should overlay a CSS operation dot inside CSG folder icons', () => {
    const group = new THREE.Group();
    markAsSolidCsgGroup(group, SolidOperation.Intersecting);
    const groupItem = new OutlinerItem(group, 0, true);
    const iconRoot = groupItem.getElement().children[1] as HTMLElement;
    const glyph = iconRoot.children[0] as HTMLElement;
    const badge = iconRoot.children[1] as HTMLElement;
    expect(iconRoot.style.position).toBe('relative');
    expect(glyph.textContent).toBe('📁');
    expect(glyph.style.color).toBe('rgb(230, 126, 34)');
    expect(badge.style.position).toBe('absolute');
    expect(badge.style.backgroundColor).toBe('rgb(41, 128, 185)');
    expect(badge.style.borderRadius).toBe('50%');
    expect(badge.style.display).toBe('block');
    setSolidGroupOperation(group, SolidOperation.Additive);
    groupItem.refreshIcon();
    expect(badge.style.display).toBe('none');
    groupItem.dispose();
  });

  it('should vertically center chevron, icon, name, and toggle slots', () => {
    const itemWithChildren = new OutlinerItem(mesh, 0, true);
    const row = itemWithChildren.getElement();
    const chevron = row.children[0] as HTMLElement;
    const icon = row.children[1] as HTMLElement;
    const name = row.children[2] as HTMLElement;
    const visibility = row.children[3] as HTMLElement;
    const lock = row.children[4] as HTMLElement;
    expect(row.style.alignItems).toBe('center');
    expect(chevron.style.display).toBe('inline-flex');
    expect(chevron.style.alignItems).toBe('center');
    expect(icon.style.display).toBe('inline-flex');
    expect(icon.style.alignItems).toBe('center');
    expect(name.style.display).toBe('block');
    expect(name.style.lineHeight).toBe('16px');
    expect(name.style.textOverflow).toBe('ellipsis');
    expect(visibility.style.display).toBe('inline-flex');
    expect(lock.style.display).toBe('inline-flex');
    itemWithChildren.dispose();
  });
});
