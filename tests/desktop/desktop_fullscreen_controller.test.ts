import { describe, expect, it, vi } from 'vitest';
import { DesktopFullscreenController } from '../../src/desktop/desktop_fullscreen_controller.js';

describe('DesktopFullscreenController', () => {
  it('alternates the native window between fullscreen and restored states', () => {
    const setFullScreen = vi.fn();
    const controller = new DesktopFullscreenController({ setFullScreen });

    expect(controller.toggle()).toBe(true);
    expect(controller.toggle()).toBe(false);
    expect(setFullScreen.mock.calls).toEqual([[true], [false]]);
  });
});
