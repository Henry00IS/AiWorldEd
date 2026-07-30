import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { ContextMenu, ContextMenuItem } from '../../src/ui/context_menu.js';

describe('ContextMenu', () => {
  let container: HTMLElement;
  let menu: ContextMenu;
  let items: ContextMenuItem[];
  let callback1: Mock<() => void>;
  let callback2: Mock<() => void>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    callback1 = vi.fn<() => void>();
    callback2 = vi.fn<() => void>();
    items = [
      { label: 'Duplicate', callback: callback1 },
      { label: 'Delete', callback: callback2 },
    ];
    menu = new ContextMenu(container, items);
  });

  afterEach(() => {
    menu.dispose();
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  it('should create menu with action rows using the shared menu system', () => {
    menu.show(100, 100);
    const menuEl = menu.getElement();
    expect(menuEl.classList.contains('editor-toolbar-dropdown-menu')).toBe(true);
    expect(menuEl.querySelectorAll('.editor-toolbar-dropdown-item').length).toBe(2);
  });

  it('should render real separators between sections', () => {
    const separated = new ContextMenu(container, [
      { kind: 'action', label: 'Duplicate', callback: callback1 },
      { kind: 'separator' },
      { kind: 'action', label: 'Delete', callback: callback2 },
    ]);
    separated.show(40, 40);
    const menuEl = separated.getElement();
    expect(menuEl.querySelectorAll('[role="separator"]').length).toBe(1);
    expect(menuEl.querySelectorAll('.editor-toolbar-dropdown-item').length).toBe(2);
    separated.dispose();
  });

  it('should treat legacy --- labels as separators', () => {
    const legacy = new ContextMenu(container, [
      { label: 'Duplicate', callback: callback1 },
      { label: '---', callback: () => undefined },
      { label: 'Delete', callback: callback2 },
    ]);
    legacy.show(20, 20);
    expect(legacy.getElement().querySelectorAll('[role="separator"]').length).toBe(1);
    legacy.dispose();
  });

  it('should invoke correct callback on item click', () => {
    menu.show(100, 100);
    const menuEl = menu.getElement();
    const firstItem = menuEl.querySelector('.editor-toolbar-dropdown-item') as HTMLButtonElement;
    firstItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(callback1).toHaveBeenCalled();
    expect(callback2).not.toHaveBeenCalled();
  });

  it('should hide menu after item selection', () => {
    menu.show(100, 100);
    const menuEl = menu.getElement();
    expect(menuEl.style.display).toBe('block');
    const firstItem = menuEl.querySelector('.editor-toolbar-dropdown-item') as HTMLButtonElement;
    firstItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(menuEl.style.display).toBe('none');
  });

  it('should hide menu on outside click', () => {
    menu.show(100, 100);
    const menuEl = menu.getElement();
    expect(menuEl.style.display).toBe('block');
    const outsideTarget = document.createElement('div');
    document.body.appendChild(outsideTarget);
    outsideTarget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(menuEl.style.display).toBe('none');
    outsideTarget.remove();
  });

  it('should hide menu on Escape key press', () => {
    menu.show(100, 100);
    const menuEl = menu.getElement();
    expect(menuEl.style.display).toBe('block');
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    expect(menuEl.style.display).toBe('none');
  });

  it('should not invoke callback for disabled items', () => {
    const disabledCallback = vi.fn();
    const disabledItems: ContextMenuItem[] = [{ label: 'Disabled Item', callback: disabledCallback, disabled: true }];
    const disabledMenu = new ContextMenu(container, disabledItems);
    disabledMenu.show(100, 100);
    const button = disabledMenu.getElement().querySelector('.editor-toolbar-dropdown-item') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(disabledCallback).not.toHaveBeenCalled();
    disabledMenu.dispose();
  });

  it('should not hide on click inside the menu', () => {
    menu.show(100, 100);
    const menuEl = menu.getElement();
    expect(menuEl.style.display).toBe('block');
    menuEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(menuEl.style.display).toBe('block');
  });
});
