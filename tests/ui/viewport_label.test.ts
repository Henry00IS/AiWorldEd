import { describe, it, expect, beforeEach } from 'vitest';
import { ViewportLabel } from '../../src/ui/viewport_label.js';
import { Theme } from '../../src/theme.js';

describe('ViewportLabel', () => {
  let parentElement: HTMLElement;

  beforeEach(() => {
    parentElement = document.createElement('div');
    parentElement.style.position = 'relative';
    parentElement.style.width = '400px';
    parentElement.style.height = '300px';
    document.body.appendChild(parentElement);
  });

  it('should create a label element as a child of the parent', () => {
    const label = new ViewportLabel(parentElement, 'Top');
    expect(parentElement.children.length).toBe(1);
    expect(label.getLabelElement()).toBe(parentElement.children[0]);
  });

  it('should display the provided text content', () => {
    const labelNames = ['Top', 'Front', 'Side', 'Perspective'];
    labelNames.forEach((name) => {
      const testParent = document.createElement('div');
      document.body.appendChild(testParent);
      const label = new ViewportLabel(testParent, name);
      expect(label.getLabelElement().textContent).toBe(name);
    });
  });

  it('should apply absolute positioning to the label', () => {
    const label = new ViewportLabel(parentElement, 'Test');
    const labelEl = label.getLabelElement();
    expect(labelEl.style.position).toBe('absolute');
  });

  it('should position the label in the top-left corner', () => {
    const label = new ViewportLabel(parentElement, 'Test');
    const labelEl = label.getLabelElement();
    expect(labelEl.style.top).toBe('8px');
    expect(labelEl.style.left).toBe('8px');
  });

  it('should use the theme text color', () => {
    const label = new ViewportLabel(parentElement, 'Test');
    const labelEl = label.getLabelElement();
    const expectedRgb = hexToRgb(Theme.viewportLabelTextColor);
    expect(labelEl.style.color).toBe(expectedRgb);
  });

  it('should use the theme background color', () => {
    const label = new ViewportLabel(parentElement, 'Test');
    const labelEl = label.getLabelElement();
    expect(labelEl.style.background).toBe(Theme.viewportLabelBackgroundColor);
  });

  it('should prevent pointer events on the label', () => {
    const label = new ViewportLabel(parentElement, 'Test');
    const labelEl = label.getLabelElement();
    expect(labelEl.style.pointerEvents).toBe('none');
  });

  it('should prevent text selection on the label', () => {
    const label = new ViewportLabel(parentElement, 'Test');
    const labelEl = label.getLabelElement();
    expect(labelEl.style.userSelect).toBe('none');
  });

  it('should set a positive z-index for proper layering', () => {
    const label = new ViewportLabel(parentElement, 'Test');
    const labelEl = label.getLabelElement();
    expect(labelEl.style.zIndex).toBe('10');
  });

  it('should apply monospace font family', () => {
    const label = new ViewportLabel(parentElement, 'Test');
    const labelEl = label.getLabelElement();
    expect(labelEl.style.fontFamily).toBe('monospace');
  });

  it('should apply bold font weight', () => {
    const label = new ViewportLabel(parentElement, 'Test');
    const labelEl = label.getLabelElement();
    expect(labelEl.style.fontWeight).toBe('bold');
  });

  it('should apply border radius for rounded corners', () => {
    const label = new ViewportLabel(parentElement, 'Test');
    const labelEl = label.getLabelElement();
    expect(labelEl.style.borderRadius).toBe('4px');
  });
});

function hexToRgb(hexColor: string): string {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}
