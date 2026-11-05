import { UI_THEME_ATTRIBUTE } from './theme_ui_palette.js';

type ThemeChromeRefreshCallback = () => void;

const themeChromeRefreshCallbacks = new Set<ThemeChromeRefreshCallback>();
let themeChromeObserver: MutationObserver | null = null;

/**
 * Registers a callback that repaints live chrome when the UI theme changes.
 *
 * @param callback Refresh callback.
 * @returns Function that unregisters the callback.
 */
export function onUiThemeChromeRefresh(callback: ThemeChromeRefreshCallback): () => void {
  themeChromeRefreshCallbacks.add(callback);
  ensureThemeChromeObserver();
  return () => {
    themeChromeRefreshCallbacks.delete(callback);
  };
}

/** Invokes every registered chrome refresh callback. */
export function runUiThemeChromeRefresh(): void {
  themeChromeRefreshCallbacks.forEach((callback) => callback());
}

/** Clears every registered chrome refresh callback. Intended for tests. */
export function clearUiThemeChromeRefreshCallbacks(): void {
  themeChromeRefreshCallbacks.clear();
}

/** Starts watching the document root for theme attribute changes. */
function ensureThemeChromeObserver(): void {
  if (themeChromeObserver) {
    return;
  }
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return;
  }
  themeChromeObserver = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.attributeName === UI_THEME_ATTRIBUTE)) {
      runUiThemeChromeRefresh();
    }
  });
  themeChromeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [UI_THEME_ATTRIBUTE],
  });
}
