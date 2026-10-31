/**
 * Capture-phase Escape closer for open root menus. Listens on the owner window
 * so menus in detached popup windows close too, and consumes the Escape press
 * so it does not also reach editor shortcuts, tools, or dialogs.
 */
export class MenuEscapeClose {
  private ownerWindow: Window | null;
  private keydownListener: ((event: KeyboardEvent) => void) | null;

  /** Creates an inactive Escape closer. */
  constructor() {
    this.ownerWindow = null;
    this.keydownListener = null;
  }

  /**
   * Starts listening for Escape presses on the given window, replacing any
   * previous listener owned by this closer.
   *
   * @param ownerWindow Window that owns the menu (main or detached).
   * @param onEscape Invoked once per Escape press; returns true when it closed
   *   a menu so the press is consumed, false to let the press through.
   */
  begin(ownerWindow: Window, onEscape: () => boolean): void {
    this.end();
    this.ownerWindow = ownerWindow;
    this.keydownListener = (event) => {
      if (!MenuEscapeClose.isEscapeKeyEvent(event)) {
        return;
      }
      if (onEscape()) {
        MenuEscapeClose.keyboardEventConsume(event);
      }
    };
    this.ownerWindow.addEventListener('keydown', this.keydownListener, true);
  }

  /** Removes the capture-phase listener when active. */
  end(): void {
    if (this.ownerWindow && this.keydownListener) {
      this.ownerWindow.removeEventListener('keydown', this.keydownListener, true);
    }
    this.ownerWindow = null;
    this.keydownListener = null;
  }

  /**
   * Returns whether this closer currently listens for Escape.
   *
   * @returns True between {@link begin} and {@link end}.
   */
  isActive(): boolean {
    return this.keydownListener !== null;
  }

  /**
   * Returns whether a keyboard event is an Escape press.
   *
   * @param event Browser keyboard event.
   * @returns True for the Escape key.
   */
  static isEscapeKeyEvent(event: KeyboardEvent): boolean {
    return event.key === 'Escape' || event.code === 'Escape';
  }

  /**
   * Prevents the default action and stops every further listener from seeing
   * the event.
   *
   * @param event Browser keyboard event to consume.
   */
  private static keyboardEventConsume(event: KeyboardEvent): void {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }
}
