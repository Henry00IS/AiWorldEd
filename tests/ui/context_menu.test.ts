import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ContextMenu, ContextMenuItem } from '../../src/ui/context_menu.js';

describe('ContextMenu', () => {
  let container: HTMLElement;
  let menu: ContextMenu;
  let items: ContextMenuItem[];
  let callback1: ReturnType<typeof vi.fn>;
  let callback2: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    callback1 = vi.fn();
    callback2 = vi.fn();
    items = [
      { label: 'Duplicate', callback: callback1 },
      { label: 'Delete', callback: callback2 }
    ];
    menu = new ContextMenu(container, items);
  });

  afterEach(() => {
    menu.dispose();
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  it('should create menu with correct item count', () => {
    menu.show(100, 100);
    const menuEl = container.children[0] as HTMLElement;
    expect(menuEl.children.length).toBe(2);
  });

  it('should invoke correct callback on item click', () => {
    menu.show(100, 100);
    const menuEl = container.children[0] as HTMLElement;
    menuEl.children[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(callback1).toHaveBeenCalled();
    expect(callback2).not.toHaveBeenCalled();
  });

  it('should hide menu after item selection', () => {
    menu.show(100, 100);
    const menuEl = container.children[0] as HTMLElement;
    expect(menuEl.style.display).toBe('block');
    menuEl.children[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(menuEl.style.display).toBe('none');
  });

  it('should hide menu on outside click', () => {
    menu.show(100, 100);
    const menuEl = container.children[0] as HTMLElement;
    expect(menuEl.style.display).toBe('block');
    const outsideTarget = document.createElement('div');
    document.body.appendChild(outsideTarget);
    outsideTarget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(menuEl.style.display).toBe('none');
  });

  it('should hide menu on Escape key press', () => {
    menu.show(100, 100);
    const menuEl = container.children[0] as HTMLElement;
    expect(menuEl.style.display).toBe('block');
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    expect(menuEl.style.display).toBe('none');
  });

  it('should not invoke callback for disabled items', () => {
    const disabledCallback = vi.fn();
    const disabledItems: ContextMenuItem[] = [
      { label: 'Disabled Item', callback: disabledCallback, disabled: true }
    ];
    const disabledMenu = new ContextMenu(container, disabledItems);
    disabledMenu.show(100, 100);
    const menuEl = container.children[1] as HTMLElement;
    menuEl.children[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(disabledCallback).not.toHaveBeenCalled();
    disabledMenu.dispose();
  });

  it('should not hide on click inside the menu', () => {
    menu.show(100, 100);
    const menuEl = container.children[0] as HTMLElement;
    expect(menuEl.style.display).toBe('block');
    menuEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(menuEl.style.display).toBe('block');
  });
});
