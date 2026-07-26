import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesktopFullscreenShortcut } from '../../src/desktop/desktop_fullscreen_shortcut.js';

let shortcut: DesktopFullscreenShortcut | null = null;

afterEach(() => {
  shortcut?.dispose();
  shortcut = null;
});

describe('DesktopFullscreenShortcut', () => {
  it('requests native fullscreen and prevents default for F11', () => {
    const requestToggle = vi.fn(async () => true);
    shortcut = new DesktopFullscreenShortcut(requestToggle);
    const event = new KeyboardEvent('keydown', { code: 'F11', cancelable: true });
    window.dispatchEvent(event);
    expect(requestToggle).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves other keyboard events untouched', () => {
    const requestToggle = vi.fn(async () => true);
    shortcut = new DesktopFullscreenShortcut(requestToggle);
    const event = new KeyboardEvent('keydown', { code: 'KeyF', cancelable: true });
    window.dispatchEvent(event);
    expect(requestToggle).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
