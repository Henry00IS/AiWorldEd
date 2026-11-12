import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MenuContext, MenuContextItem } from '@/ui/menu/menu_context.js';
import { FloatingPanelStack } from '@/ui/floating_panel/panel_floating_stack.js';
import {
  menuPopoverDismissProbeEscape,
  menuPopoverDismissProbePress,
  menuPopoverDismissProbeShortcutsInstall,
  menuPopoverDismissProbeViewportCreate,
} from './menu_popover_dismiss_probe.js';

describe('MenuContext', () => {
  let container: HTMLElement;
  let menu: MenuContext;
  let items: MenuContextItem[];
  let callback1: ReturnType<typeof vi.fn<() => void>>;
  let callback2: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    FloatingPanelStack.resetForTests();
    container = document.createElement('div');
    document.body.appendChild(container);
    callback1 = vi.fn<() => void>();
    callback2 = vi.fn<() => void>();
    items = [
      { label: 'Duplicate', callback: callback1 },
      { label: 'Delete', callback: callback2 },
    ];
    menu = new MenuContext(container, items);
  });

  afterEach(() => {
    menu.dispose();
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
    FloatingPanelStack.resetForTests();
  });

  it('should create menu with action rows using the shared menu system', () => {
    menu.show(100, 100);
    const menuEl = menu.getElement();
    expect(menuEl.classList.contains('editor-toolbar-dropdown-menu')).toBe(true);
    expect(menuEl.querySelectorAll('.editor-toolbar-dropdown-item').length).toBe(2);
  });

  it('should render real separators between sections', () => {
    const separated = new MenuContext(container, [
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
    const legacy = new MenuContext(container, [
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
    expect(document.body.contains(menuEl)).toBe(true);
    const firstItem = menuEl.querySelector('.editor-toolbar-dropdown-item') as HTMLButtonElement;
    firstItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(menuEl.style.display).toBe('none');
    expect(document.body.contains(menuEl)).toBe(false);
  });

  it('should hide menu on outside click', () => {
    menu.show(100, 100);
    const menuEl = menu.getElement();
    expect(menuEl.style.display).toBe('block');
    const outsideTarget = document.createElement('div');
    document.body.appendChild(outsideTarget);
    menuPopoverDismissProbePress(outsideTarget);
    expect(menuEl.style.display).toBe('none');
    expect(document.body.contains(menuEl)).toBe(false);
    outsideTarget.remove();
  });

  it('should hide menu on a viewport press that prevents the default mouse events', () => {
    menu.show(100, 100);
    const viewport = menuPopoverDismissProbeViewportCreate();
    expect(menuPopoverDismissProbePress(viewport.canvas)).toBe(false);
    expect(menu.getElement().style.display).toBe('none');
    viewport.remove();
  });

  it('should keep Escape that closes the menu away from editor shortcuts', () => {
    menu.show(100, 100);
    const shortcuts = menuPopoverDismissProbeShortcutsInstall();
    menuPopoverDismissProbeEscape();
    expect(menu.getElement().style.display).toBe('none');
    expect(shortcuts.keydown).not.toHaveBeenCalled();
    menuPopoverDismissProbeEscape();
    expect(shortcuts.keydown).toHaveBeenCalledTimes(1);
    shortcuts.remove();
  });

  it('should hide menu on Escape key press', () => {
    menu.show(100, 100);
    const menuEl = menu.getElement();
    expect(menuEl.style.display).toBe('block');
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    expect(menuEl.style.display).toBe('none');
    expect(document.body.contains(menuEl)).toBe(false);
  });

  it('should remove the menu shell from the document when closed via hide', () => {
    menu.show(50, 60);
    const menuEl = menu.getElement();
    expect(document.body.contains(menuEl)).toBe(true);
    menu.hide();
    expect(document.body.contains(menuEl)).toBe(false);
    expect(FloatingPanelStack.containsEventTarget(menuEl)).toBe(false);
  });

  it('should not invoke callback for disabled items', () => {
    const disabledCallback = vi.fn();
    const disabledItems: MenuContextItem[] = [{ label: 'Disabled Item', callback: disabledCallback, disabled: true }];
    const disabledMenu = new MenuContext(container, disabledItems);
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
    menuPopoverDismissProbePress(menuEl);
    expect(menuEl.style.display).toBe('block');
  });
});
