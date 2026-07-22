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
    const separatorCount = Array.from(toolbarElement.children).filter(
      (child) => child.tagName === 'DIV'
    ).length;
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
    const expectedNormal = `rgb(${(Theme.buttonBackground >> 16) & 255}, ${(Theme.buttonBackground >> 8) & 255}, ${Theme.buttonBackground & 255})`;
    button.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    button.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    expect(button.style.background).toBe(expectedNormal);
  });

  it('should remove from DOM on dispose', () => {
    toolbar.dispose();
    expect(container.children.length).toBe(0);
  });
});
