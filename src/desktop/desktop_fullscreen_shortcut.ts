/** Registers the desktop-only F11 native fullscreen shortcut. */
export class DesktopFullscreenShortcut {
  private readonly requestToggle: () => Promise<boolean>;
  private readonly listener: (event: KeyboardEvent) => void;

  /**
   * Creates and registers an F11 listener.
   *
   * @param requestToggle Requests a native fullscreen state change.
   */
  constructor(requestToggle: () => Promise<boolean>) {
    this.requestToggle = requestToggle;
    this.listener = (event) => this.onKeyDown(event);
    window.addEventListener('keydown', this.listener);
  }

  /** Removes the F11 listener. */
  dispose(): void {
    window.removeEventListener('keydown', this.listener);
  }

  /**
   * Handles desktop F11 presses without invoking browser fullscreen.
   *
   * @param event Keyboard event dispatched by the desktop webview.
   */
  private onKeyDown(event: KeyboardEvent): void {
    if (event.code !== 'F11') return;
    event.preventDefault();
    void this.requestToggle();
  }
}
