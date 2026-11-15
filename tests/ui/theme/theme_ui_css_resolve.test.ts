import { describe, expect, it } from 'vitest';
import { themeCssResolveDarkFallback, themeCssResolveDarkStyleValue } from '@/ui/theme/theme_ui_css_resolve.js';

describe('theme_ui_css_resolve', () => {
  it('replaces nested variable references with their fallbacks', () => {
    expect(themeCssResolveDarkFallback('var(--outer, var(--inner, #123456))')).toBe('#123456');
    expect(themeCssResolveDarkFallback('1px solid var(--edge, rgb(1, 2, 3))')).toBe('1px solid rgb(1, 2, 3)');
  });

  it('keeps nested function arguments inside a fallback intact', () => {
    const gradient = 'linear-gradient(180deg, rgb(1, 2, 3) 0%, rgb(4, 5, 6) 100%)';
    expect(themeCssResolveDarkFallback(`var(--gradient, ${gradient})`)).toBe(gradient);
  });

  it('collapses the theme shadow strength factor to the dark opacity', () => {
    const value = '0 0 0 1px rgba(0, 0, 0, calc(0.35 * var(--aiworlded-shadow-strength, 1)))';
    expect(themeCssResolveDarkFallback(value)).toBe('0 0 0 1px rgba(0, 0, 0, 0.35)');
  });

  it('normalizes the resolved dark value the way inline styles report it', () => {
    expect(themeCssResolveDarkStyleValue('color', 'var(--text, #e0e0e0)')).toBe('rgb(224, 224, 224)');
  });
});
