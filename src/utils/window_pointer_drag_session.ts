/**
 * Captures pointer move and release on window for a drag that began on a
 * specific element. Releasing over toolbars or other UI still ends the drag.
 */
export class WindowPointerDragSession {
  private boundMove: ((event: PointerEvent) => void) | null;
  private boundUp: ((event: Event) => void) | null;

  /**
   * Creates an inactive window pointer drag session.
   */
  constructor() {
    this.boundMove = null;
    this.boundUp = null;
  }

  /**
   * Attaches window-level move and release listeners for an active drag.
   * Replaces any previous capture from this session.
   * @param onMove Called for each window pointermove during the drag.
   * @param onUp Called once for pointerup or pointercancel; listeners are
   * removed before this callback runs.
   */
  begin(
    onMove: (event: PointerEvent) => void,
    onUp: () => void
  ): void {
    this.end();
    this.boundMove = (event) => onMove(event);
    this.boundUp = () => this.finishWithCallback(onUp);
    window.addEventListener('pointermove', this.boundMove);
    window.addEventListener('pointerup', this.boundUp);
    window.addEventListener('pointercancel', this.boundUp);
  }

  /**
   * Removes window listeners if any are attached.
   */
  end(): void {
    if (this.boundMove) {
      window.removeEventListener('pointermove', this.boundMove);
    }
    if (this.boundUp) {
      window.removeEventListener('pointerup', this.boundUp);
      window.removeEventListener('pointercancel', this.boundUp);
    }
    this.boundMove = null;
    this.boundUp = null;
  }

  /**
   * Returns whether this session currently owns window listeners.
   * @returns True when move/up listeners are attached to window.
   */
  isActive(): boolean {
    return this.boundMove !== null;
  }

  /**
   * Detaches listeners then invokes the release callback.
   * @param onUp Caller-provided release handler.
   */
  private finishWithCallback(onUp: () => void): void {
    this.end();
    onUp();
  }
}
