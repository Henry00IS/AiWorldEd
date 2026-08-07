/**
 * Stores a desired CSS mouse cursor and target element, applies that cursor
 * while requests are refreshed, and restores the default when none are
 * refreshed.
 */
export class ManagerMouseCursor {
  private desiredCursorCss: string;
  private desiredTargetElement: HTMLElement | null;
  private refreshedThisFrame: boolean;
  private appliedCursorCss: string;
  private appliedTargetElement: HTMLElement | null;

  /** Creates a cursor manager with no active request. */
  constructor() {
    this.desiredCursorCss = '';
    this.desiredTargetElement = null;
    this.refreshedThisFrame = false;
    this.appliedCursorCss = '';
    this.appliedTargetElement = null;
  }

  /**
   * Requests a CSS cursor on a target element for the current editor frame.
   * Call again every frame while the cursor should remain active.
   *
   * @param cursorCss CSS cursor value such as `ew-resize` or `default`.
   * @param targetElement Element that receives the cursor style.
   */
  setMouseCursor(cursorCss: string, targetElement: HTMLElement): void {
    this.desiredCursorCss = cursorCss;
    this.desiredTargetElement = targetElement;
    this.refreshedThisFrame = true;
    this.applyDesiredCursor();
  }

  /**
   * Keeps the applied cursor when a request was refreshed this frame; otherwise
   * restores the default cursor on the applied target.
   */
  update(): void {
    if (this.refreshedThisFrame) {
      this.refreshedThisFrame = false;
      return;
    }
    this.restoreDefaultCursor();
  }

  /**
   * Returns the CSS cursor last applied to a target, or empty when none.
   *
   * @returns Applied CSS cursor string.
   */
  getAppliedCursorCss(): string {
    return this.appliedCursorCss;
  }

  /**
   * Returns the element currently showing the applied cursor, or null.
   *
   * @returns Applied target element.
   */
  getAppliedTargetElement(): HTMLElement | null {
    return this.appliedTargetElement;
  }

  /** Clears applied and pending cursor state. */
  reset(): void {
    this.restoreDefaultCursor();
    this.refreshedThisFrame = false;
  }

  /**
   * Writes the desired cursor onto the desired target, clearing any previous
   * target that no longer owns the request.
   */
  private applyDesiredCursor(): void {
    const targetElement = this.desiredTargetElement;
    if (!targetElement) {
      return;
    }
    this.switchAppliedTargetIfNeeded(targetElement);
    this.writeCursorOnAppliedTarget(this.desiredCursorCss);
  }

  /** Clears the applied cursor style and forgets the pending request. */
  private restoreDefaultCursor(): void {
    this.clearAppliedElementCursor();
    this.desiredCursorCss = '';
    this.desiredTargetElement = null;
  }

  /**
   * Moves ownership of the applied cursor to a new target element when needed.
   *
   * @param targetElement Element that should own the cursor style.
   */
  private switchAppliedTargetIfNeeded(targetElement: HTMLElement): void {
    if (this.appliedTargetElement === targetElement) {
      return;
    }
    this.clearAppliedElementCursor();
    this.appliedTargetElement = targetElement;
  }

  /**
   * Sets the CSS cursor on the applied target when the value changed.
   *
   * @param cursorCss CSS cursor value to write.
   */
  private writeCursorOnAppliedTarget(cursorCss: string): void {
    const targetElement = this.appliedTargetElement;
    if (!targetElement?.style) {
      return;
    }
    if (this.appliedCursorCss === cursorCss) {
      return;
    }
    targetElement.style.cursor = cursorCss;
    this.appliedCursorCss = cursorCss;
  }

  /** Removes the inline cursor style from the applied target element. */
  private clearAppliedElementCursor(): void {
    if (this.appliedTargetElement?.style) {
      this.appliedTargetElement.style.cursor = '';
    }
    this.appliedTargetElement = null;
    this.appliedCursorCss = '';
  }
}

/** Shared {@link ManagerMouseCursor} instance. */
export const managerMouseCursor = new ManagerMouseCursor();
