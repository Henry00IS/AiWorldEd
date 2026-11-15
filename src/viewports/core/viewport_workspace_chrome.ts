import { ThemeCss } from '@/ui/theme/theme_ui_css_variables.js';
import { getActiveThemeViewportPalette } from '@/viewports/theme/theme_viewport_palette.js';

/**
 * Class shared by every viewport workspace host, in the main and detached
 * windows.
 */
export const VIEWPORT_WORKSPACE_HOST_CLASS = 'editor-viewport-area';

/** Background of a viewport workspace: the themed separator between panes. */
export const VIEWPORT_WORKSPACE_BACKGROUND = ThemeCss.separatorColor;

/**
 * Applies the chrome every viewport workspace host shares: the class, the
 * positioning context for its pane layer and canvas, and the themed separator
 * colour that shows in the gaps between panes. The main window and detached
 * windows both call this, so their separators cannot drift apart.
 *
 * @param host Workspace host element.
 */
export function viewportWorkspaceHostApply(host: HTMLElement): void {
  host.classList.add(VIEWPORT_WORKSPACE_HOST_CLASS);
  host.style.position = 'relative';
  host.style.overflow = 'hidden';
  host.style.background = VIEWPORT_WORKSPACE_BACKGROUND;
}

/**
 * Returns the colour the shared surface clears to before drawing panes, which
 * is what shows in the gaps between panes: the active theme's separator.
 *
 * @returns Numeric RGB colour.
 */
export function viewportWorkspaceSeparatorClearColor(): number {
  return getActiveThemeViewportPalette().separatorColor;
}
