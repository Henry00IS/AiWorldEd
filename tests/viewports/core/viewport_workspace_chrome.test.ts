import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  VIEWPORT_WORKSPACE_BACKGROUND,
  VIEWPORT_WORKSPACE_HOST_CLASS,
  viewportWorkspaceHostApply,
  viewportWorkspaceSeparatorClearColor,
} from '@/viewports/core/viewport_workspace_chrome.js';
import { MultiViewComposer } from '@/viewports/core/multi_view_composer.js';
import type { RenderSurface } from '@/viewports/shared/render_surface.js';
import { ThemeCss } from '@/ui/theme/theme_ui_css_variables.js';
import { themeCssResolveDarkFallback } from '@/ui/theme/theme_ui_css_resolve.js';
import { UI_THEME_ATTRIBUTE } from '@/ui/theme/theme_ui_palette.js';
import { getThemeViewportPalette } from '@/viewports/theme/theme_viewport_palette.js';
import { Theme } from '@/theme.js';

/**
 * Creates a render surface that records the clear colour of each frame.
 *
 * @returns Surface and its recorded clear colours.
 */
function recordingSurface(): { surface: RenderSurface; clears: number[] } {
  const clears: number[] = [];
  const canvas = document.createElement('canvas');
  const surface = {
    syncSizeFromWorkspace: vi.fn(),
    getCanvas: () => canvas,
    getLogicalSize: () => ({ width: 100, height: 100 }),
    renderPanes: (_scene: THREE.Scene, _panes: unknown, clearColor: number) => clears.push(clearColor),
  } as unknown as RenderSurface;
  return { surface, clears };
}

describe('viewport_workspace_chrome', () => {
  afterEach(() => document.documentElement.removeAttribute(UI_THEME_ATTRIBUTE));

  it('gives a workspace host the shared class and themed separator background', () => {
    const host = document.createElement('div');
    viewportWorkspaceHostApply(host);
    expect(host.classList.contains(VIEWPORT_WORKSPACE_HOST_CLASS)).toBe(true);
    expect(VIEWPORT_WORKSPACE_BACKGROUND).toBe(ThemeCss.separatorColor);
    expect(themeCssResolveDarkFallback(host.style.background)).toBe(
      `#${Theme.separatorColor.toString(16).padStart(6, '0')}`,
    );
  });

  it('keeps the CSS separator and the canvas gap colour from one palette value', () => {
    expect(viewportWorkspaceSeparatorClearColor()).toBe(Theme.separatorColor);
    document.documentElement.setAttribute(UI_THEME_ATTRIBUTE, 'light');
    expect(viewportWorkspaceSeparatorClearColor()).toBe(getThemeViewportPalette('light').separatorColor);
  });

  it('clears every multi-view frame to the active theme separator', () => {
    const { surface, clears } = recordingSurface();
    const composer = new MultiViewComposer(surface);
    composer.render(new THREE.Scene(), []);
    document.documentElement.setAttribute(UI_THEME_ATTRIBUTE, 'light');
    composer.render(new THREE.Scene(), []);
    expect(clears).toEqual([Theme.separatorColor, getThemeViewportPalette('light').separatorColor]);
  });
});
