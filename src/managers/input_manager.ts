/**
 * Tracks global keyboard and mouse button state for the editor.
 * Clears stuck keys when the window loses focus so navigation cannot run away.
 */
export class InputManager {
  private keyStates: Map<string, boolean>;
  private mouseButtonStates: Map<number, boolean>;
  private keyDownListener: ((event: KeyboardEvent) => void) | null;
  private keyUpListener: ((event: KeyboardEvent) => void) | null;
  private pointerDownListener: ((event: PointerEvent) => void) | null;
  private pointerUpListener: ((event: PointerEvent) => void) | null;
  private blurListener: (() => void) | null;
  private visibilityListener: (() => void) | null;
  private isDisposed: boolean;

  /**
   * Creates a new input manager and registers keyboard and mouse listeners.
   */
  constructor() {
    this.keyStates = new Map();
    this.mouseButtonStates = new Map();
    this.keyDownListener = null;
    this.keyUpListener = null;
    this.pointerDownListener = null;
    this.pointerUpListener = null;
    this.blurListener = null;
    this.visibilityListener = null;
    this.isDisposed = false;
    this.setupKeyboardListeners();
    this.setupMouseListeners();
    this.setupFocusListeners();
  }

  /**
   * Registers window-level keyboard event listeners to track key states.
   */
  private setupKeyboardListeners(): void {
    this.keyDownListener = (event) => {
      this.keyStates.set(event.code, true);
    };
    this.keyUpListener = (event) => {
      this.keyStates.set(event.code, false);
    };
    window.addEventListener('keydown', this.keyDownListener);
    window.addEventListener('keyup', this.keyUpListener);
  }

  /**
   * Registers window-level mouse button listeners for navigation guards.
   */
  private setupMouseListeners(): void {
    this.pointerDownListener = (event) => {
      this.mouseButtonStates.set(event.button, true);
    };
    this.pointerUpListener = (event) => {
      this.mouseButtonStates.set(event.button, false);
    };
    window.addEventListener('pointerdown', this.pointerDownListener);
    window.addEventListener('pointerup', this.pointerUpListener);
  }

  /**
   * Clears all input state when the window loses focus or is hidden.
   */
  private setupFocusListeners(): void {
    this.blurListener = () => this.reset();
    this.visibilityListener = () => {
      if (document.hidden) {
        this.reset();
      }
    };
    window.addEventListener('blur', this.blurListener);
    document.addEventListener('visibilitychange', this.visibilityListener);
  }

  /**
   * Checks whether a specific key is currently pressed.
   * @param keyCode The keyboard event code string to check.
   * @returns True if the key is held down.
   */
  isKeyDown(keyCode: string): boolean {
    return this.keyStates.get(keyCode) === true;
  }

  /**
   * Checks whether a mouse button is currently pressed.
   * @param button The mouse button index (0 left, 1 middle, 2 right).
   * @returns True if the button is held.
   */
  isMouseButtonDown(button: number): boolean {
    return this.mouseButtonStates.get(button) === true;
  }

  /**
   * Returns true while right-mouse navigation is active in the 3D viewport.
   * @returns True if the right mouse button is held.
   */
  isRightMouseDown(): boolean {
    return this.isMouseButtonDown(2);
  }

  /**
   * Checks whether either Shift key is currently pressed.
   * @returns True if left or right shift is held down.
   */
  isShiftDown(): boolean {
    return this.keyStates.get('ShiftLeft') === true || this.keyStates.get('ShiftRight') === true;
  }

  /**
   * Checks whether either Ctrl key is currently pressed.
   * @returns True if left or right control is held down.
   */
  isCtrlDown(): boolean {
    return this.keyStates.get('ControlLeft') === true || this.keyStates.get('ControlRight') === true;
  }

  /**
   * Checks whether either Alt key is currently pressed.
   * @returns True if left or right alt is held down.
   */
  isAltDown(): boolean {
    return this.keyStates.get('AltLeft') === true || this.keyStates.get('AltRight') === true;
  }

  /**
   * Clears all tracked key and mouse button states. Useful for test resets.
   */
  reset(): void {
    this.keyStates.clear();
    this.mouseButtonStates.clear();
  }

  /**
   * Removes all global listeners and clears tracked input state.
   * Safe to call more than once.
   */
  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.removeKeyboardListeners();
    this.removeMouseListeners();
    this.removeFocusListeners();
    this.reset();
  }

  /**
   * Unregisters keyboard window listeners.
   */
  private removeKeyboardListeners(): void {
    if (this.keyDownListener) {
      window.removeEventListener('keydown', this.keyDownListener);
      this.keyDownListener = null;
    }
    if (this.keyUpListener) {
      window.removeEventListener('keyup', this.keyUpListener);
      this.keyUpListener = null;
    }
  }

  /**
   * Unregisters mouse window listeners.
   */
  private removeMouseListeners(): void {
    if (this.pointerDownListener) {
      window.removeEventListener('pointerdown', this.pointerDownListener);
      this.pointerDownListener = null;
    }
    if (this.pointerUpListener) {
      window.removeEventListener('pointerup', this.pointerUpListener);
      this.pointerUpListener = null;
    }
  }

  /**
   * Unregisters focus and visibility listeners.
   */
  private removeFocusListeners(): void {
    if (this.blurListener) {
      window.removeEventListener('blur', this.blurListener);
      this.blurListener = null;
    }
    if (this.visibilityListener) {
      document.removeEventListener('visibilitychange', this.visibilityListener);
      this.visibilityListener = null;
    }
  }
}
