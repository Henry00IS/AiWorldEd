import { themeCssResolveDarkStyleValue } from '@/ui/theme/theme_ui_css_resolve.js';
import { describe, it, expect, beforeEach } from 'vitest';
import { ViewportLabel } from '@/ui/viewport_chrome/viewport_label.js';
import { Theme } from '@/theme.js';

describe('ViewportLabel', () => {
  let parentElement: HTMLElement;

  beforeEach(() => {
    parentElement = document.createElement('div');
    parentElement.style.position = 'relative';
    parentElement.style.width = '400px';
    parentElement.style.height = '300px';
    document.body.appendChild(parentElement);
  });

  it('should create a non-interactive label with the provided text', () => {
    const label = new ViewportLabel(parentElement, 'Top');
    const labelEl = label.getLabelElement();
    expect(parentElement.children.length).toBe(1);
    expect(labelEl).toBe(parentElement.children[0]);
    expect(labelEl.textContent).toBe('Top');
    expect(labelEl.style.position).toBe('absolute');
    expect(labelEl.style.top).toBe('8px');
    expect(labelEl.style.left).toBe('8px');
    expect(labelEl.style.pointerEvents).toBe('none');
    expect(labelEl.style.userSelect).toBe('none');
  });

  it('should display each standard viewport name', () => {
    const labelNames = ['Top', 'Front', 'Side', 'Perspective'];
    labelNames.forEach((name) => {
      const testParent = document.createElement('div');
      document.body.appendChild(testParent);
      const label = new ViewportLabel(testParent, name);
      expect(label.getLabelElement().textContent).toBe(name);
    });
  });

  it('should apply theme colors', () => {
    const label = new ViewportLabel(parentElement, 'Test');
    const labelEl = label.getLabelElement();
    expect(themeCssResolveDarkStyleValue('color', labelEl.style.color)).toBe(hexToRgb(Theme.viewportLabelTextColor));
    expect(themeCssResolveDarkStyleValue('background', labelEl.style.background)).toBe(
      Theme.viewportLabelBackgroundColor,
    );
  });
});

/**
 * Converts a hex color string to the rgb() form browsers report for inline
 * styles.
 *
 * @param hexColor Hex color like #rrggbb.
 * @returns CSS rgb() string.
 */
function hexToRgb(hexColor: string): string {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}
