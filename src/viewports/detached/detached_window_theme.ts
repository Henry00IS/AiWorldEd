import { themeCssVariablesStylesheetBuild } from '@/ui/theme/theme_ui_css_variables.js';
import { UI_THEME_ATTRIBUTE } from '@/ui/theme/theme_ui_palette.js';

/** Identifier of the theme stylesheet inside a detached window. */
const DETACHED_WINDOW_THEME_STYLE_ID = 'aiworlded-theme-css-variables';

/**
 * Installs the theme variables stylesheet into a detached window document so
 * its inline `var()` colours resolve exactly as in the main window.
 *
 * @param popupDocument Detached window document.
 */
export function detachedWindowThemeStylesheetInstall(popupDocument: Document): void {
  const existing = popupDocument.getElementById(DETACHED_WINDOW_THEME_STYLE_ID);
  const style = existing ?? popupDocument.createElement('style');
  style.id = DETACHED_WINDOW_THEME_STYLE_ID;
  style.textContent = themeCssVariablesStylesheetBuild();
  if (!style.isConnected) popupDocument.head.appendChild(style);
}

/**
 * Copies the main window's theme attribute onto the detached window root.
 *
 * @param popupDocument Detached window document.
 * @param hostDocument Main editor document.
 */
export function detachedWindowThemeAttributeCopy(popupDocument: Document, hostDocument: Document): void {
  const theme = hostDocument.documentElement.getAttribute(UI_THEME_ATTRIBUTE);
  if (theme === null) popupDocument.documentElement.removeAttribute(UI_THEME_ATTRIBUTE);
  else popupDocument.documentElement.setAttribute(UI_THEME_ATTRIBUTE, theme);
}

/**
 * Gives a detached window the editor theme and keeps it in step with live theme
 * switches in the main window.
 *
 * @param popupDocument Detached window document.
 * @param hostDocument Main editor document.
 * @returns Stops following the main window theme.
 */
export function detachedWindowThemeBind(popupDocument: Document, hostDocument: Document): () => void {
  detachedWindowThemeStylesheetInstall(popupDocument);
  detachedWindowThemeAttributeCopy(popupDocument, hostDocument);
  if (typeof MutationObserver === 'undefined') return () => undefined;
  const observer = new MutationObserver(() => detachedWindowThemeAttributeCopy(popupDocument, hostDocument));
  observer.observe(hostDocument.documentElement, { attributes: true, attributeFilter: [UI_THEME_ATTRIBUTE] });
  return () => observer.disconnect();
}
