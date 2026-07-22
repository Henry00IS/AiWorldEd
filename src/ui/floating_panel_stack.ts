/**
 * Base z-index for editor floating tool windows (Tools, Texture, etc.).
 */
const FLOATING_PANEL_BASE_Z_INDEX = 5000;

/**
 * Shared stacking order for floating editor panels.
 * Each bring-to-front call increments a counter so the focused panel draws above peers.
 */
export class FloatingPanelStack {
  private static nextZIndex = FLOATING_PANEL_BASE_Z_INDEX;

  /**
   * Assigns the next highest z-index so the panel appears above other floating panels.
   * @param panel Root element of the floating panel.
   */
  static bringToFront(panel: HTMLElement): void {
    FloatingPanelStack.nextZIndex += 1;
    panel.style.zIndex = String(FloatingPanelStack.nextZIndex);
  }

  /**
   * Resets the stack counter (for tests).
   */
  static resetForTests(): void {
    FloatingPanelStack.nextZIndex = FLOATING_PANEL_BASE_Z_INDEX;
  }

  /**
   * Returns the current top z-index value without consuming a new one.
   * @returns Last assigned z-index.
   */
  static getCurrentTopZIndex(): number {
    return FloatingPanelStack.nextZIndex;
  }
}
