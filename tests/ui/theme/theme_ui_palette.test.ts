import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  buildDarkUiThemePalette,
  buildLightUiThemePalette,
  getActiveUiThemePalette,
  resolveUiThemeId,
  UI_THEME_ATTRIBUTE,
  type UiThemePalette,
  uiThemePaletteCssVariableName,
} from '@/ui/theme/theme_ui_palette.js';
import { themeCssResolveDarkFallback } from '@/ui/theme/theme_ui_css_resolve.js';

const LIGHT_TOKENS: ReadonlyArray<keyof UiThemePalette> = [
  'frameBackground',
  'chromeBackground',
  'menuBackground',
  'panelBackground',
  'dialogBackground',
  'controlBackground',
  'inputBackground',
  'buttonBackground',
];

describe('theme_ui_palette', () => {
  const originalTheme = document.documentElement.getAttribute(UI_THEME_ATTRIBUTE);

  beforeEach(() => {
    document.documentElement.removeAttribute(UI_THEME_ATTRIBUTE);
  });

  afterEach(() => {
    if (originalTheme === null) {
      document.documentElement.removeAttribute(UI_THEME_ATTRIBUTE);
    } else {
      document.documentElement.setAttribute(UI_THEME_ATTRIBUTE, originalTheme);
    }
  });

  it('should resolve the theme id from the document root attribute', () => {
    expect(resolveUiThemeId(document.documentElement)).toBe('dark');
    document.documentElement.setAttribute(UI_THEME_ATTRIBUTE, 'light');
    expect(resolveUiThemeId(document.documentElement)).toBe('light');
    document.documentElement.setAttribute(UI_THEME_ATTRIBUTE, 'system');
    expect(resolveUiThemeId(document.documentElement)).toBe('dark');
  });

  it('should resolve every active palette token to the dark palette value as fallback', () => {
    const palette = getActiveUiThemePalette();
    const dark = buildDarkUiThemePalette();
    (Object.keys(dark) as (keyof UiThemePalette)[]).forEach((token) => {
      expect(palette[token]).toContain(uiThemePaletteCssVariableName(token));
      expect(themeCssResolveDarkFallback(palette[token])).toBe(dark[token]);
    });
  });

  it('should return the same theme-aware palette regardless of the active theme', () => {
    const darkActive = getActiveUiThemePalette();
    document.documentElement.setAttribute(UI_THEME_ATTRIBUTE, 'light');
    expect(getActiveUiThemePalette()).toBe(darkActive);
  });

  it('should keep the light palette distinct from the dark palette', () => {
    const dark = buildDarkUiThemePalette();
    const light = buildLightUiThemePalette();
    LIGHT_TOKENS.forEach((token) => {
      expect(light[token]).not.toBe(dark[token]);
    });
  });

  it('should use one blue interaction accent in the light palette', () => {
    const light = buildLightUiThemePalette();
    const accent = light.selectionBorderColor;
    expect(light.dialogTabActiveBorderColor).toBe(accent);
    expect(light.focusOutlineColor).toBe(accent);
    expect(light.rangeAccentColor).toBe(accent);
    const blue = parseInt(accent.slice(5, 7), 16);
    const red = parseInt(accent.slice(1, 3), 16);
    expect(blue).toBeGreaterThan(red);
  });

  it('should use an orange selection accent in the dark palette', () => {
    const dark = buildDarkUiThemePalette();
    expect(dark.dialogTabActiveBorderColor).toContain('232, 106, 23');
    expect(dark.selectionBorderColor).toContain('232, 106, 23');
  });
});
