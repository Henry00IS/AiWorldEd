import { describe, expect, it, vi } from 'vitest';

import { desktopFullscreenToggle } from '@/desktop/fullscreen/desktop_fullscreen_toggle.js';
import {
  desktopFullscreenShortcutInstall,
  desktopFullscreenShortcutMatches,
} from '@/desktop/fullscreen/desktop_fullscreen_shortcut.js';
import { createDesktopFullscreenBridge } from '@/desktop/fullscreen/desktop_fullscreen_protocol.js';

/**
 * Creates a native window stand-in that remembers its fullscreen state.
 *
 * @param initial Fullscreen state at the start.
 * @returns Window stand-in.
 */
function fakeWindowCreate(initial: boolean) {
  const state = { fullScreen: initial };
  return {
    state,
    isFullScreen: () => state.fullScreen,
    setFullScreen: vi.fn((next: boolean) => {
      state.fullScreen = next;
    }),
  };
}

/**
 * Dispatches a key press on the window.
 *
 * @param init Key event fields.
 * @returns The dispatched event.
 */
function keyPress(init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  document.body.dispatchEvent(event);
  return event;
}

describe('desktop fullscreen toggle', () => {
  it('enters fullscreen from the normal frame and leaves it again', () => {
    const desktopWindow = fakeWindowCreate(false);

    expect(desktopFullscreenToggle(desktopWindow)).toBe(true);
    expect(desktopWindow.state.fullScreen).toBe(true);
    expect(desktopFullscreenToggle(desktopWindow)).toBe(false);
    expect(desktopWindow.state.fullScreen).toBe(false);
  });

  it('asks the Bun process through the window fullscreen request', async () => {
    const windowFullscreenToggle = vi.fn(async () => true);
    const bridge = createDesktopFullscreenBridge({ request: { windowFullscreenToggle } });

    await expect(bridge.toggle()).resolves.toBe(true);
    expect(windowFullscreenToggle).toHaveBeenCalledOnce();
  });
});

describe('desktop fullscreen shortcut', () => {
  it('matches a fresh F11 press without modifiers only', () => {
    expect(desktopFullscreenShortcutMatches(new KeyboardEvent('keydown', { code: 'F11' }))).toBe(true);
    expect(desktopFullscreenShortcutMatches(new KeyboardEvent('keydown', { code: 'F11', repeat: true }))).toBe(false);
    expect(desktopFullscreenShortcutMatches(new KeyboardEvent('keydown', { code: 'F11', ctrlKey: true }))).toBe(false);
    expect(desktopFullscreenShortcutMatches(new KeyboardEvent('keydown', { code: 'F10' }))).toBe(false);
  });

  it('toggles once per F11 press, also from a text field, and stops after removal', () => {
    const toggle = vi.fn(async () => true);
    const remove = desktopFullscreenShortcutInstall(window, { toggle });
    const editorListener = vi.fn();
    document.body.addEventListener('keydown', editorListener);
    const input = document.createElement('input');
    document.body.append(input);

    const event = keyPress({ code: 'F11', key: 'F11' });
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, code: 'F11' }));
    keyPress({ code: 'KeyF', key: 'f' });
    remove();
    keyPress({ code: 'F11', key: 'F11' });

    expect(toggle).toHaveBeenCalledTimes(2);
    expect(event.defaultPrevented).toBe(true);
    expect(editorListener).toHaveBeenCalledTimes(2);
    document.body.removeEventListener('keydown', editorListener);
    input.remove();
  });
});
