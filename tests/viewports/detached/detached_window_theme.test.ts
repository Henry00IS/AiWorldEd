import { afterEach, describe, expect, it } from 'vitest';
import { detachedWindowThemeBind } from '@/viewports/detached/detached_window_theme.js';
import { UI_THEME_ATTRIBUTE } from '@/ui/theme/theme_ui_palette.js';

/**
 * Creates an empty document like a freshly written popup.
 *
 * @returns Popup document.
 */
function popupDocumentCreate(): Document {
  return document.implementation.createHTMLDocument('popup');
}

describe('detached_window_theme', () => {
  afterEach(() => document.documentElement.removeAttribute(UI_THEME_ATTRIBUTE));

  it('installs the theme stylesheet and copies the theme on open', () => {
    document.documentElement.setAttribute(UI_THEME_ATTRIBUTE, 'light');
    const popup = popupDocumentCreate();
    const stop = detachedWindowThemeBind(popup, document);
    expect(popup.getElementById('aiworlded-theme-css-variables')?.textContent).toContain('--aiworlded-gray-1a1a1a');
    expect(popup.documentElement.getAttribute(UI_THEME_ATTRIBUTE)).toBe('light');
    stop();
  });

  it('follows live theme switches until stopped', async () => {
    document.documentElement.setAttribute(UI_THEME_ATTRIBUTE, 'dark');
    const popup = popupDocumentCreate();
    const stop = detachedWindowThemeBind(popup, document);
    document.documentElement.setAttribute(UI_THEME_ATTRIBUTE, 'light');
    await Promise.resolve();
    expect(popup.documentElement.getAttribute(UI_THEME_ATTRIBUTE)).toBe('light');
    stop();
    document.documentElement.setAttribute(UI_THEME_ATTRIBUTE, 'dark');
    await Promise.resolve();
    expect(popup.documentElement.getAttribute(UI_THEME_ATTRIBUTE)).toBe('light');
  });
});
