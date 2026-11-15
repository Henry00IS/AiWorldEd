import { afterEach, describe, expect, it } from 'vitest';
import {
  THEME_CSS_VARIABLE_DEFINITIONS,
  ThemeCss,
  ensureThemeCssVariables,
  themeCssVariablesStylesheetBuild,
} from '@/ui/theme/theme_ui_css_variables.js';
import { themeCssResolveDarkFallback } from '@/ui/theme/theme_ui_css_resolve.js';
import { buildDarkUiThemePalette, buildLightUiThemePalette, UI_THEME_ATTRIBUTE } from '@/ui/theme/theme_ui_palette.js';
import { Theme } from '@/theme.js';

/**
 * Returns the stylesheet text that belongs to the light theme block.
 *
 * @returns Light block text.
 */
function lightBlockText(): string {
  const stylesheet = themeCssVariablesStylesheetBuild();
  return stylesheet.slice(stylesheet.indexOf(`[${UI_THEME_ATTRIBUTE}="light"]`));
}

describe('theme_ui_css_variables', () => {
  afterEach(() => {
    document.getElementById('aiworlded-theme-css-variables')?.remove();
  });

  it('keeps every theme-aware value resolving to the original dark color', () => {
    expect(themeCssResolveDarkFallback(ThemeCss.textColor)).toBe(Theme.buttonTextColor);
    expect(themeCssResolveDarkFallback(ThemeCss.mutedTextColor)).toBe(Theme.statusBarTextColor);
    expect(themeCssResolveDarkFallback(ThemeCss.inputBorderColor)).toBe(Theme.inputBorderColor);
    expect(themeCssResolveDarkFallback(ThemeCss.accentAlpha(0.22))).toBe('rgba(232, 106, 23, 0.22)');
    expect(themeCssResolveDarkFallback(ThemeCss.inkAlpha(0.12))).toBe('rgba(255, 255, 255, 0.12)');
    expect(themeCssResolveDarkFallback(ThemeCss.shadowAlpha(0.55))).toBe('rgba(0, 0, 0, 0.55)');
  });

  it('defines each variable once with a distinct light value for the light theme', () => {
    const names = THEME_CSS_VARIABLE_DEFINITIONS.map((definition) => definition.name);
    expect(new Set(names).size).toBe(names.length);
    const lightBlock = lightBlockText();
    for (const definition of THEME_CSS_VARIABLE_DEFINITIONS) {
      expect(lightBlock).toContain(`${definition.name}: ${definition.light};`);
    }
  });

  it('places the dark values on the root and the light palette values under the light attribute', () => {
    const stylesheet = themeCssVariablesStylesheetBuild();
    const darkBlock = stylesheet.slice(0, stylesheet.indexOf(`[${UI_THEME_ATTRIBUTE}="light"]`));
    expect(darkBlock).toContain(`: ${buildDarkUiThemePalette().panelBackground};`);
    expect(lightBlockText()).toContain(`: ${buildLightUiThemePalette().panelBackground};`);
    expect(lightBlockText()).toContain('color-scheme: light;');
  });

  it('installs a single stylesheet even when called repeatedly', () => {
    ensureThemeCssVariables();
    ensureThemeCssVariables();
    const styles = document.head.querySelectorAll('#aiworlded-theme-css-variables');
    expect(styles).toHaveLength(1);
    expect(styles[0]?.textContent).toBe(themeCssVariablesStylesheetBuild());
  });
});
