import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  WINDOWS_VIRTUAL_KEY_F11,
  type KeyboardDesktopWindow,
  type WindowKeyEvent,
  windowsWindowKeyboardInstall,
} from '@/desktop/windows_window_keyboard.js';

type Handlers = Record<string, ((event: unknown) => void) | undefined>;

function fakeWindow(): { window: KeyboardDesktopWindow; handlers: Handlers; activate: ReturnType<typeof vi.fn> } {
  const handlers: Handlers = {};
  const activate = vi.fn();
  const window: KeyboardDesktopWindow = {
    activate,
    on: (name, handler) => {
      handlers[name] = handler;
    },
  };
  return { window, handlers, activate };
}

function keyDown(keyCode: number, modifiers = 0, isRepeat = false): WindowKeyEvent {
  return { data: { keyCode, modifiers, isRepeat } };
}

describe('Windows desktop window keyboard', () => {
  it('toggles fullscreen when F11 reaches the native window itself', () => {
    const { window, handlers } = fakeWindow();
    const fullscreenToggle = vi.fn();
    windowsWindowKeyboardInstall(window, { platform: 'win32', fullscreenToggle });

    handlers['keyDown']?.(keyDown(WINDOWS_VIRTUAL_KEY_F11));
    expect(fullscreenToggle).toHaveBeenCalledOnce();
  });

  it('ignores held, modified and other keys on the native window', () => {
    const { window, handlers } = fakeWindow();
    const fullscreenToggle = vi.fn();
    windowsWindowKeyboardInstall(window, { platform: 'win32', fullscreenToggle });

    handlers['keyDown']?.(keyDown(WINDOWS_VIRTUAL_KEY_F11, 0, true));
    handlers['keyDown']?.(keyDown(WINDOWS_VIRTUAL_KEY_F11, 1 << 1));
    handlers['keyDown']?.(keyDown(0x7b));
    expect(fullscreenToggle).not.toHaveBeenCalled();
  });

  it('hands keyboard focus back to the webview once per window activation', () => {
    const { window, handlers, activate } = fakeWindow();
    windowsWindowKeyboardInstall(window, { platform: 'win32', fullscreenToggle: vi.fn() });

    handlers['focus']?.({});
    expect(activate).toHaveBeenCalledOnce();
    // The focus event caused by that activate call is not answered again.
    handlers['focus']?.({});
    expect(activate).toHaveBeenCalledOnce();

    handlers['blur']?.({});
    handlers['focus']?.({});
    expect(activate).toHaveBeenCalledTimes(2);
  });

  it('leaves Linux and macOS alone, where the webview keeps keyboard focus', () => {
    for (const platform of ['linux', 'darwin'] as const) {
      const { window, handlers } = fakeWindow();
      windowsWindowKeyboardInstall(window, { platform, fullscreenToggle: vi.fn() });
      expect(Object.keys(handlers)).toEqual([]);
    }
  });

  it('is installed on the editor window by the desktop entry', () => {
    const bunEntry = readFileSync(resolve(process.cwd(), 'src/desktop/bun/index.ts'), 'utf8');
    expect(bunEntry).toContain('windowsWindowKeyboardInstall(shownWindow');
  });
});
