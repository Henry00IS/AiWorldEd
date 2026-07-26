/** Native desktop window operations required for fullscreen toggling. */
export interface FullscreenDesktopWindow {
  /**
   * Changes native fullscreen mode.
   *
   * @param fullscreen Whether the window should fill the entire display.
   */
  setFullScreen(fullscreen: boolean): void;
}

/** Tracks and applies native desktop fullscreen state. */
export class DesktopFullscreenController {
  private readonly desktopWindow: FullscreenDesktopWindow;
  private fullscreen: boolean;

  /**
   * Creates a fullscreen controller for one native window.
   *
   * @param desktopWindow Native window to control.
   */
  constructor(desktopWindow: FullscreenDesktopWindow) {
    this.desktopWindow = desktopWindow;
    this.fullscreen = false;
  }

  /**
   * Toggles native fullscreen mode.
   *
   * @returns The newly applied fullscreen state.
   */
  toggle(): boolean {
    this.fullscreen = !this.fullscreen;
    this.desktopWindow.setFullScreen(this.fullscreen);
    return this.fullscreen;
  }
}
