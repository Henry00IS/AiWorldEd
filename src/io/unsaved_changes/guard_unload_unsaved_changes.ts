/** Window surface the guard needs: just beforeunload listener registration. */
export interface GuardUnloadUnsavedChangesWindow {
  addEventListener(type: 'beforeunload', listener: (event: BeforeUnloadEvent) => void): void;
  removeEventListener(type: 'beforeunload', listener: (event: BeforeUnloadEvent) => void): void;
}

/**
 * Asks the browser to show its standard "Leave site? Changes you made may not
 * be saved." confirmation when the page is about to reload or close (F5,
 * Ctrl+R, the reload button, closing the tab or window) while the scene has
 * unsaved changes. Browsers do not allow custom text in this dialog and only
 * show it after the user interacted with the page.
 *
 * Attach it to the main editor window only; detached viewport popups closing on
 * their own must never prompt.
 */
export class GuardUnloadUnsavedChanges {
  private readonly targetWindow: GuardUnloadUnsavedChangesWindow;
  private readonly hasUnsavedChanges: () => boolean;
  private readonly handleBeforeUnload: (event: BeforeUnloadEvent) => void;
  private unloadAllowedOnce: boolean;
  private attached: boolean;

  /**
   * Creates the guard and starts listening for beforeunload.
   *
   * @param targetWindow Main editor window to guard.
   * @param hasUnsavedChanges Returns true while the scene differs from the last
   *   saved or loaded state.
   */
  constructor(targetWindow: GuardUnloadUnsavedChangesWindow, hasUnsavedChanges: () => boolean) {
    this.targetWindow = targetWindow;
    this.hasUnsavedChanges = hasUnsavedChanges;
    this.unloadAllowedOnce = false;
    this.handleBeforeUnload = (event) => this.onBeforeUnload(event);
    this.targetWindow.addEventListener('beforeunload', this.handleBeforeUnload);
    this.attached = true;
  }

  /**
   * Lets the next unload through without a prompt. Used right before the editor
   * itself reloads on purpose after its own confirmation dialog.
   */
  allowNextUnload(): void {
    this.unloadAllowedOnce = true;
  }

  /** Stops listening for beforeunload. Safe to call more than once. */
  dispose(): void {
    if (!this.attached) {
      return;
    }
    this.attached = false;
    this.targetWindow.removeEventListener('beforeunload', this.handleBeforeUnload);
  }

  /**
   * Requests the browser confirmation when there are unsaved changes, unless
   * the editor allowed this unload.
   *
   * @param event Browser beforeunload event.
   */
  private onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.unloadAllowedOnce) {
      this.unloadAllowedOnce = false;
      return;
    }
    if (!this.hasUnsavedChanges()) {
      return;
    }
    event.preventDefault();
    event.returnValue = true;
  }
}
