import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Toolbar } from '@/ui/toolbar/toolbar.js';
import { Theme } from '@/theme.js';

/**
 * Finds the open root dropdown mounted on document.body (menus leave the
 * toolbar stacking context so they paint above floating tool windows).
 *
 * @returns Open menu element or null.
 */
function queryOpenRootMenu(): HTMLElement | null {
  return document.body.querySelector('.editor-toolbar-dropdown-menu[style*="display: block"]');
}

describe('Toolbar', () => {
  let container: HTMLElement;
  let toolbar: Toolbar;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    toolbar = new Toolbar(container);
  });

  afterEach(() => {
    toolbar.dispose();
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
    document.querySelectorAll('.editor-toolbar-dropdown-menu').forEach((node) => node.remove());
  });

  it('should add a button to the toolbar', () => {
    const button = toolbar.addButton('Test Button', () => {});
    expect(button).toBeInstanceOf(HTMLButtonElement);
    expect(button.textContent).toBe('Test Button');
  });

  it('should add an icon button with accessible label', () => {
    const clickHandler = vi.fn();
    const button = toolbar.addIconButton('Undo', '<svg></svg>', clickHandler);
    expect(button.getAttribute('aria-label')).toBe('Undo');
    button.click();
    expect(clickHandler).toHaveBeenCalledTimes(1);
  });

  it('should replace icons with labels in the large state when enabled', () => {
    const button = toolbar.addIconButton('Undo', '<svg></svg>', () => {});
    const label = button.querySelector('[data-toolbar-button-label]') as HTMLElement;
    const icon = button.querySelector('svg') as SVGElement;
    expect(label.style.display).toBe('none');
    expect(icon.style.display).toBe('');

    expect(toolbar.getSize()).toBe('medium');
    toolbar.setSize('large');
    expect(label.style.display).toBe('');
    expect(icon.style.display).toBe('none');

    toolbar.setButtonLabelsEnabled(false);
    expect(label.style.display).toBe('none');
    expect(icon.style.display).toBe('');
  });

  it('should snap bottom-edge dragging to small, medium, and large states', () => {
    const handle = container.querySelector('.editor-toolbar-resize-handle') as HTMLElement;
    handle.dispatchEvent(new PointerEvent('pointerdown', { clientY: 100, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientY: 145 }));
    expect(toolbar.getSize()).toBe('large');
    window.dispatchEvent(new PointerEvent('pointermove', { clientY: 55 }));
    expect(toolbar.getSize()).toBe('small');
    window.dispatchEvent(new PointerEvent('pointerup'));
  });

  it('should size top toolbar icons to 25 by 25 pixels', () => {
    const button = toolbar.addIconButton('Undo', '<svg width="16" height="16"></svg>', () => {});
    const icon = button.querySelector('svg');

    expect(icon?.getAttribute('width')).toBe('25');
    expect(icon?.getAttribute('height')).toBe('25');
  });

  it('should fire click callback when button is clicked', () => {
    const clickHandler = vi.fn();
    const button = toolbar.addButton('Click Me', clickHandler);
    button.click();
    expect(clickHandler).toHaveBeenCalledTimes(1);
  });

  it('should fire callback multiple times on multiple clicks', () => {
    const clickHandler = vi.fn();
    const button = toolbar.addButton('Click Me', clickHandler);
    button.click();
    button.click();
    button.click();
    expect(clickHandler).toHaveBeenCalledTimes(3);
  });

  it('should add separator element', () => {
    toolbar.addButton('Before', () => {});
    toolbar.addSeparator();
    toolbar.addButton('After', () => {});
    const toolbarElement = container.children[0] as HTMLElement;
    const separatorCount = Array.from(toolbarElement.children).filter((child) => child.tagName === 'DIV').length;
    expect(separatorCount).toBe(1);
  });

  it('should apply a gradient dark background to toolbar', () => {
    const toolbarElement = container.children[0] as HTMLElement;
    expect(toolbarElement.style.background).toContain('linear-gradient');
    expect(toolbarElement.style.background).toContain('rgb(');
  });

  it('should apply flex layout to toolbar', () => {
    const toolbarElement = container.children[0] as HTMLElement;
    expect(toolbarElement.style.display).toBe('flex');
  });

  it('should vertically center toolbar controls with equal padding', () => {
    const toolbarElement = container.children[0] as HTMLElement;
    expect(toolbarElement.style.alignItems).toBe('center');
    expect(toolbarElement.style.padding).toBe('6px 8px');
  });

  it('should wrap toolbar rows to avoid off-screen overflow', () => {
    const toolbarElement = container.children[0] as HTMLElement;
    expect(toolbarElement.style.flexWrap).toBe('wrap');
  });

  it('should support dropdown menus with nested actions', () => {
    const clickHandler = vi.fn();
    toolbar.addDropdown('File', [{ label: 'Save', onClick: clickHandler }]);
    expect(toolbar.getButtonCount()).toBe(1);
    expect(toolbar.getButtonIndexByLabel('File')).toBe(0);
  });

  it('should render separators, shortcuts, and nested submenus', () => {
    const importHandler = vi.fn();
    toolbar.addDropdown('File', [
      { label: 'New', onClick: () => {} },
      { kind: 'separator' },
      { label: 'Save', onClick: () => {}, shortcut: () => 'Ctrl+S' },
      {
        kind: 'submenu',
        label: 'Import',
        children: [{ label: 'Valve Map Format 2006 (.vmf)…', onClick: importHandler }],
      },
    ]);
    const header = container.querySelector('.editor-toolbar-menu-button') as HTMLButtonElement;
    header.click();
    const menu = queryOpenRootMenu();
    expect(menu).not.toBeNull();
    expect(menu!.parentElement).toBe(document.body);
    expect(menu!.querySelector('.editor-toolbar-dropdown-separator')).not.toBeNull();
    expect(menu!.textContent).toContain('Ctrl+S');
    const importHost = menu!.querySelector('.editor-toolbar-dropdown-submenu-host') as HTMLElement;
    importHost.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    const importParent = importHost.querySelector('button') as HTMLButtonElement;
    expect(importParent.style.background).not.toBe('transparent');
    const submenu = menu!.querySelector('.editor-toolbar-dropdown-submenu') as HTMLElement;
    expect(submenu.style.display).toBe('block');
    const child = submenu.querySelector('button') as HTMLButtonElement;
    child.click();
    expect(importHandler).toHaveBeenCalledTimes(1);
    expect(menu!.style.display).toBe('none');
  });

  it('should keep submenu parent highlight when switching between flyouts', () => {
    toolbar.addDropdown('File', [
      {
        kind: 'submenu',
        label: 'Import',
        children: [{ label: 'VMF', onClick: () => {} }],
      },
      {
        kind: 'submenu',
        label: 'Export',
        children: [{ label: 'GLB', onClick: () => {} }],
      },
    ]);
    const header = container.querySelector('.editor-toolbar-menu-button') as HTMLButtonElement;
    header.click();
    const menu = queryOpenRootMenu();
    expect(menu).not.toBeNull();
    const hosts = menu!.querySelectorAll('.editor-toolbar-dropdown-submenu-host');
    const importHost = hosts[0] as HTMLElement;
    const exportHost = hosts[1] as HTMLElement;
    const importButton = importHost.querySelector('button') as HTMLButtonElement;
    const exportButton = exportHost.querySelector('button') as HTMLButtonElement;

    importHost.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    expect(importButton.style.background).not.toBe('transparent');

    exportHost.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    expect(exportButton.style.background).not.toBe('transparent');
    expect(importButton.style.background).toBe('transparent');
    expect((exportHost.querySelector('.editor-toolbar-dropdown-submenu') as HTMLElement).style.display).toBe('block');
  });

  it('should switch from an open dropdown to another menu on hover', () => {
    toolbar.addDropdown('File', [{ label: 'Save', onClick: () => {} }]);
    toolbar.addDropdown('Edit', [{ label: 'Delete', onClick: () => {} }]);
    const headers = container.querySelectorAll('.editor-toolbar-menu-button');

    (headers[0] as HTMLButtonElement).click();
    const firstOpen = queryOpenRootMenu();
    expect(firstOpen).not.toBeNull();
    expect(firstOpen!.textContent).toContain('Save');
    expect(headers[0]!.getAttribute('aria-expanded')).toBe('true');

    headers[1]!.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    const secondOpen = queryOpenRootMenu();
    expect(secondOpen).not.toBeNull();
    expect(secondOpen!.textContent).toContain('Delete');
    expect(headers[0]!.getAttribute('aria-expanded')).toBe('false');
    expect(headers[1]!.getAttribute('aria-expanded')).toBe('true');
  });

  it('should expose light-theme dropdown selectors for readable menu surfaces', async () => {
    const { ensureViewSettingsStyles } = await import('@/settings/view/view_settings_styles.js');
    ensureViewSettingsStyles();
    const stylesheet = document.getElementById('aiworlded-view-settings-styles');

    expect(stylesheet?.textContent).not.toContain('!important');
  });

  it('should disable dropdown items when isEnabled returns false', () => {
    const clickHandler = vi.fn();
    let enabled = false;
    toolbar.addDropdown('CSG', [
      {
        label: 'Union',
        onClick: clickHandler,
        isEnabled: () => enabled,
      },
    ]);
    const header = container.querySelector('button') as HTMLButtonElement;
    header.click();
    const menu = queryOpenRootMenu();
    expect(menu).not.toBeNull();
    const menuItem = menu!.querySelector('button') as HTMLButtonElement;
    expect(menuItem.disabled).toBe(true);
    menuItem.click();
    expect(clickHandler).not.toHaveBeenCalled();
    enabled = true;
    header.click();
    header.click();
    const reopened = queryOpenRootMenu();
    expect(reopened).not.toBeNull();
    const enabledItem = reopened!.querySelector('button') as HTMLButtonElement;
    expect(enabledItem.disabled).toBe(false);
    enabledItem.click();
    expect(clickHandler).toHaveBeenCalledTimes(1);
  });

  it('should activate buttons by label prefix', () => {
    toolbar.addButton('Move', () => {});
    toolbar.addButton('Rotate', () => {});
    toolbar.setButtonActiveByLabel('Rotate', true);
    const rotateButton = container.querySelectorAll('button')[1] as HTMLButtonElement;
    expect(rotateButton.style.color).toBe('rgb(255, 255, 255)');
  });

  it('should keep buttons active after a theme chrome refresh', () => {
    toolbar.addButton('Snap', () => {});
    toolbar.addButton('Global', () => {});
    toolbar.setButtonActiveByLabel('Snap', true);
    toolbar.setButtonActiveByLabel('Global', true);
    const snapButton = container.querySelectorAll('button')[0] as HTMLButtonElement;
    const globalButton = container.querySelectorAll('button')[1] as HTMLButtonElement;
    expect(snapButton.dataset['active']).toBe('true');
    expect(globalButton.dataset['active']).toBe('true');
    toolbar.refreshThemeChrome();
    expect(snapButton.dataset['active']).toBe('true');
    expect(snapButton.style.background).not.toBe('transparent');
    expect(globalButton.dataset['active']).toBe('true');
    expect(globalButton.style.background).not.toBe('transparent');
  });

  it('should apply correct button text color', () => {
    const button = toolbar.addButton('Test', () => {});
    const hex = Theme.buttonTextColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const expectedRgb = `rgb(${r}, ${g}, ${b})`;
    expect(button.style.color).toBe(expectedRgb);
  });

  it('should apply system UI font to buttons', () => {
    const button = toolbar.addButton('Test', () => {});
    expect(button.style.fontFamily.toLowerCase()).toContain('segoe ui');
    expect(button.style.fontFamily.toLowerCase()).toContain('system-ui');
  });

  it('should change button background on hover', () => {
    const button = toolbar.addButton('Test', () => {});
    const expectedHover = `rgb(${(Theme.buttonHoverColor >> 16) & 255}, ${(Theme.buttonHoverColor >> 8) & 255}, ${Theme.buttonHoverColor & 255})`;
    button.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    expect(button.style.background).toBe(expectedHover);
  });

  it('should restore button background on mouse leave', () => {
    const button = toolbar.addButton('Test', () => {});
    button.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    button.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    expect(button.style.background).toBe('transparent');
  });

  it('should remove from DOM on dispose', () => {
    toolbar.dispose();
    expect(container.children.length).toBe(0);
  });
});
