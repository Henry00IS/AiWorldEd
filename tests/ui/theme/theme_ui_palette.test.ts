import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  buildDarkUiThemePalette,
  buildLightUiThemePalette,
  getActiveUiThemePalette,
  resolveUiThemeId,
  UI_THEME_ATTRIBUTE,
  type UiThemePalette,
} from '@/ui/theme/theme_ui_palette.js';

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

  it('should return the dark palette when no theme attribute is present', () => {
    const palette = getActiveUiThemePalette();
    expect(palette).toEqual(buildDarkUiThemePalette());
  });

  it('should return the light palette when the light theme is active', () => {
    document.documentElement.setAttribute(UI_THEME_ATTRIBUTE, 'light');
    const palette = getActiveUiThemePalette();
    expect(palette).toEqual(buildLightUiThemePalette());
  });

  it('should keep the light palette distinct from the dark palette', () => {
    const dark = buildDarkUiThemePalette();
    const light = buildLightUiThemePalette();
    LIGHT_TOKENS.forEach((token) => {
      expect(light[token]).not.toBe(dark[token]);
    });
  });

  it('should use a Windows-blue interaction accent in the light palette', () => {
    const light = buildLightUiThemePalette();
    expect(light.menuHoverBorderColor).toBe('#0078d4');
    expect(light.dialogTabActiveBorderColor).toBe('#0078d4');
    expect(light.selectionBorderColor).toBe('#0078d4');
    expect(light.focusOutlineColor).toBe('#0078d4');
  });

  it('should use an orange selection accent in the dark palette', () => {
    const dark = buildDarkUiThemePalette();
    expect(dark.dialogTabActiveBorderColor).toContain('232, 106, 23');
    expect(dark.selectionBorderColor).toContain('232, 106, 23');
  });
});
