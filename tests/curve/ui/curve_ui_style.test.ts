import { afterEach, describe, expect, it } from 'vitest';
import {
  CURVE_UI_COLORS,
  CURVE_UI_CSS,
  curveUiActiveThemeId,
  curveUiColorsForTheme,
  curveUiCssVariableName,
  curveUiWithTheme,
} from '@/curve/ui/curve_ui_style.js';
import { UI_THEME_ATTRIBUTE } from '@/ui/theme/theme_ui_palette.js';
import { THEME_CSS_VARIABLE_DEFINITIONS } from '@/ui/theme/theme_ui_css_variables.js';

describe('curve_ui_style', () => {
  afterEach(() => document.documentElement.removeAttribute(UI_THEME_ATTRIBUTE));

  it('keeps the original dark curve colours', () => {
    const dark = curveUiColorsForTheme('dark');
    expect(dark.background).toBe('#1b1b1b');
    expect(dark.outerBackground).toBe('#141414');
    expect(dark.line).toBe('#ff9a1f');
    expect(dark.pointOutline).toBe('#000000');
  });

  it('follows the document theme on every read', () => {
    expect(CURVE_UI_COLORS.background).toBe('#1b1b1b');
    document.documentElement.setAttribute(UI_THEME_ATTRIBUTE, 'light');
    expect(curveUiActiveThemeId()).toBe('light');
    expect(CURVE_UI_COLORS.background).toBe(curveUiColorsForTheme('light').background);
    expect(CURVE_UI_COLORS.text).not.toBe('#ffffff');
  });

  it('forces a theme only while a drawing runs', () => {
    document.documentElement.setAttribute(UI_THEME_ATTRIBUTE, 'light');
    let seen = '';
    curveUiWithTheme('dark', () => (seen = CURVE_UI_COLORS.background));
    expect(seen).toBe('#1b1b1b');
    expect(curveUiActiveThemeId()).toBe('light');
  });

  it('defines a themed CSS variable for every curve colour', () => {
    expect(curveUiCssVariableName('outerBackground')).toBe('--aiworlded-curve-outer-background');
    const definition = THEME_CSS_VARIABLE_DEFINITIONS.find((entry) => entry.name === '--aiworlded-curve-background');
    expect(definition).toEqual({ name: '--aiworlded-curve-background', dark: '#1b1b1b', light: '#ffffff' });
    expect(CURVE_UI_CSS.text).toBe('var(--aiworlded-curve-text, #ffffff)');
  });
});
