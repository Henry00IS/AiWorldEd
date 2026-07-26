import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Toolbar } from '../../src/ui/toolbar.js';
import { Theme } from '../../src/theme.js';

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
  });

  it('should create toolbar and append to container', () => {
    expect(container.children.length).toBe(1);
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

  it('should size top toolbar icons to 25 by 25 pixels', () => {
    const button = toolbar.addIconButton('Undo', '<svg width="16" height="16"></svg>', () => {});
    const icon = button.querySelector('svg');

    expect(icon?.getAttribute('width')).toBe('25');
    expect(icon?.getAttribute('height')).toBe('25');
  });

  it('should track added buttons internally', () => {
    const button1 = toolbar.addButton('Button 1', () => {});
    const button2 = toolbar.addButton('Button 2', () => {});
    expect(button1).toBeDefined();
    expect(button2).toBeDefined();
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

  it('should switch from an open dropdown to another menu on hover', () => {
    toolbar.addDropdown('File', [{ label: 'Save', onClick: () => {} }]);
    toolbar.addDropdown('Edit', [{ label: 'Delete', onClick: () => {} }]);
    const headers = container.querySelectorAll('.editor-toolbar-menu-button');
    const menus = container.querySelectorAll('.editor-toolbar-dropdown-menu');

    (headers[0] as HTMLButtonElement).click();
    expect((menus[0] as HTMLElement).style.display).toBe('block');
    expect((menus[1] as HTMLElement).style.display).toBe('none');
    expect(headers[0]!.getAttribute('aria-expanded')).toBe('true');

    headers[1]!.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    expect((menus[0] as HTMLElement).style.display).toBe('none');
    expect((menus[1] as HTMLElement).style.display).toBe('block');
    expect(headers[0]!.getAttribute('aria-expanded')).toBe('false');
    expect(headers[1]!.getAttribute('aria-expanded')).toBe('true');
  });

  it('should expose light-theme dropdown selectors for readable menu surfaces', async () => {
    const { ensureViewSettingsStyles } = await import('../../src/settings/view_settings_styles.js');
    ensureViewSettingsStyles();
    const stylesheet = document.getElementById('aiworlded-view-settings-styles');

    expect(stylesheet?.textContent).toContain('.editor-toolbar-dropdown-menu');
    expect(stylesheet?.textContent).toContain('.editor-toolbar-dropdown-item:hover');
    expect(stylesheet?.textContent).toContain('background: #ffffff !important');
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
    const menuItem = container.querySelectorAll('button')[1] as HTMLButtonElement;
    expect(menuItem.disabled).toBe(true);
    menuItem.click();
    expect(clickHandler).not.toHaveBeenCalled();
    enabled = true;
    header.click();
    header.click();
    expect(menuItem.disabled).toBe(false);
    menuItem.click();
    expect(clickHandler).toHaveBeenCalledTimes(1);
  });

  it('should activate buttons by label prefix', () => {
    toolbar.addButton('Move', () => {});
    toolbar.addButton('Rotate', () => {});
    toolbar.setButtonActiveByLabel('Rotate', true);
    const rotateButton = container.querySelectorAll('button')[1] as HTMLButtonElement;
    expect(rotateButton.style.color).toBe('rgb(255, 255, 255)');
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
