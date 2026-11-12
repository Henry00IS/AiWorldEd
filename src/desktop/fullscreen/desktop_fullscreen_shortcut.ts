import type { DesktopFullscreenBridge } from './desktop_fullscreen_protocol.js';

/** Key code that toggles fullscreen in the desktop app. */
export const DESKTOP_FULLSCREEN_SHORTCUT_CODE = 'F11';

/**
 * Tells whether a key press asks for the fullscreen toggle: F11 alone, not held
 * down.
 *
 * @param event Key press.
 * @returns True for a fresh F11 press without modifiers.
 */
export function desktopFullscreenShortcutMatches(event: KeyboardEvent): boolean {
  if (event.code !== DESKTOP_FULLSCREEN_SHORTCUT_CODE || event.repeat) {
    return false;
  }
  return !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey;
}

/**
 * Makes F11 toggle the desktop window's fullscreen state from anywhere in the
 * page, text fields included.
 *
 * @param target Window whose key presses are watched.
 * @param bridge Desktop fullscreen bridge.
 * @returns Removes the listener again.
 */
export function desktopFullscreenShortcutInstall(target: Window, bridge: DesktopFullscreenBridge): () => void {
  const listener = (event: KeyboardEvent) => desktopFullscreenShortcutHandle(event, bridge);
  target.addEventListener('keydown', listener, { capture: true });
  return () => target.removeEventListener('keydown', listener, { capture: true });
}

/**
 * Toggles fullscreen for a matching key press and keeps it from reaching the
 * editor.
 *
 * @param event Key press.
 * @param bridge Desktop fullscreen bridge.
 */
function desktopFullscreenShortcutHandle(event: KeyboardEvent, bridge: DesktopFullscreenBridge): void {
  if (!desktopFullscreenShortcutMatches(event)) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  void bridge.toggle().catch(() => undefined);
}
