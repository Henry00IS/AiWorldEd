import { afterEach, describe, expect, it } from 'vitest';
import { getActiveThemeViewportPalette, getThemeViewportPalette } from '@/viewports/theme/theme_viewport_palette.js';
import { UI_THEME_ATTRIBUTE } from '@/ui/theme/theme_ui_palette.js';
import { Theme } from '@/theme.js';

/**
 * Returns the perceived brightness of a numeric color between 0 and 1.
 *
 * @param color Numeric hex color.
 * @returns Brightness.
 */
function brightness(color: number): number {
  const red = (color >> 16) & 255;
  const green = (color >> 8) & 255;
  const blue = color & 255;
  return (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
}

describe('theme_viewport_palette', () => {
  afterEach(() => document.documentElement.removeAttribute(UI_THEME_ATTRIBUTE));

  it('keeps the dark viewport colors identical to the editor theme tokens', () => {
    const dark = getThemeViewportPalette('dark');
    expect(dark.viewportBackground).toBe(Theme.viewportBackground);
    expect(dark.gridColor).toBe(Theme.gridColor);
    expect(dark.separatorColor).toBe(Theme.separatorColor);
    expect(dark.boxEdgeColor).toBe(Theme.boxEdgeColor);
    expect(dark.viewportGradientTop).toBeNull();
    expect(dark.viewportGradientBottom).toBeNull();
  });

  it('uses a light background gradient with darker grid lines in the light theme', () => {
    const light = getThemeViewportPalette('light');
    expect(brightness(light.viewportBackground)).toBeGreaterThan(0.8);
    expect(light.viewportGradientTop).not.toBeNull();
    expect(brightness(light.viewportGradientTop ?? 0)).toBeGreaterThan(brightness(light.viewportGradientBottom ?? 0));
    expect(brightness(light.gridColor)).toBeLessThan(brightness(light.viewportBackground));
    expect(brightness(light.boxEdgeColor)).toBeLessThan(0.5);
  });

  it('follows the theme attribute on the document root', () => {
    expect(getActiveThemeViewportPalette()).toBe(getThemeViewportPalette('dark'));
    document.documentElement.setAttribute(UI_THEME_ATTRIBUTE, 'light');
    expect(getActiveThemeViewportPalette()).toBe(getThemeViewportPalette('light'));
  });
});
