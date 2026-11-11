/** Native window operations the fullscreen toggle needs. */
export type DesktopFullscreenWindow = {
  isFullScreen(): boolean;
  setFullScreen(fullScreen: boolean): unknown;
};

/**
 * Switches a native window between fullscreen and its normal frame.
 *
 * @param desktopWindow Native window hosting the editor.
 * @returns True when the window was asked to go fullscreen.
 */
export function desktopFullscreenToggle(desktopWindow: DesktopFullscreenWindow): boolean {
  const fullScreen = !desktopWindow.isFullScreen();
  desktopWindow.setFullScreen(fullScreen);
  return fullScreen;
}
