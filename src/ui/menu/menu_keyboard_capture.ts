import { doesElementContainEventTarget } from '@/utils/dom_node_realm.js';

/**
 * Menu tree that owns the keyboard while a {@link MenuKeyboardCapture} is
 * active.
 */
export interface MenuKeyboardCaptureOwner {
  /**
   * Returns the root menu element; a root that left the page ends the capture.
   *
   * @returns Root menu panel element.
   */
  getElement(): HTMLElement;
  /** Closes the whole menu tree (Escape, or the owner window losing focus). */
  requestClose(): void;
  /**
   * Handles a consumed key press as menu navigation; unknown keys do nothing.
   *
   * @param event Keydown already consumed by the capture.
   */
  navigate(event: KeyboardEvent): void;
}

/** Codes of Ctrl/Meta browser zoom shortcuts that keep their browser action. */
const BROWSER_ZOOM_CODES: ReadonlySet<string> = new Set([
  'Equal',
  'Minus',
  'Digit0',
  'NumpadAdd',
  'NumpadSubtract',
  'Numpad0',
]);

/**
 * Codes of Ctrl/Meta+Shift developer-tools shortcuts that keep their browser
 * action.
 */
const BROWSER_DEVTOOLS_CODES: ReadonlySet<string> = new Set(['KeyI', 'KeyJ', 'KeyC']);

/** Function keys F1 through F24 by key value. */
const FUNCTION_KEY_PATTERN = /^F([1-9]|1\d|2[0-4])$/;

/**
 * Capture-phase keyboard owner for open root menus, the UI equivalent of a
 * single-use tool taking all input. Listens on the owner window so menus in
 * detached popup windows capture too. Every keydown is kept from editor
 * listeners; Escape closes the menu, navigation keys drive the menu, browser
 * shortcuts keep their browser action, and everything else is swallowed. Keyup
 * is never stopped so held-key tracking cannot get stuck.
 */
export class MenuKeyboardCapture {
  private ownerWindow: Window | null;
  private owner: MenuKeyboardCaptureOwner | null;
  private readonly keydownListener: (event: KeyboardEvent) => void;
  private readonly keyupListener: (event: KeyboardEvent) => void;
  private readonly blurListener: () => void;

  /** Creates an inactive capture. */
  constructor() {
    this.ownerWindow = null;
    this.owner = null;
    this.keydownListener = (event) => this.handleKeyDown(event);
    this.keyupListener = (event) => this.handleKeyUp(event);
    this.blurListener = () => this.handleWindowBlur();
  }

  /**
   * Starts capturing keyboard input on the given window, replacing any previous
   * capture owned by this instance.
   *
   * @param ownerWindow Window that hosts the menu (main or detached).
   * @param owner Menu tree that receives Escape, blur, and navigation keys.
   */
  begin(ownerWindow: Window, owner: MenuKeyboardCaptureOwner): void {
    this.end();
    this.ownerWindow = ownerWindow;
    this.owner = owner;
    ownerWindow.addEventListener('keydown', this.keydownListener, true);
    ownerWindow.addEventListener('keyup', this.keyupListener, true);
    ownerWindow.addEventListener('blur', this.blurListener);
  }

  /** Removes the capture listeners when active. */
  end(): void {
    if (this.ownerWindow) {
      this.ownerWindow.removeEventListener('keydown', this.keydownListener, true);
      this.ownerWindow.removeEventListener('keyup', this.keyupListener, true);
      this.ownerWindow.removeEventListener('blur', this.blurListener);
    }
    this.ownerWindow = null;
    this.owner = null;
  }

  /**
   * Returns whether this capture currently owns the keyboard.
   *
   * @returns True between {@link begin} and {@link end}.
   */
  isActive(): boolean {
    return this.owner !== null;
  }

  /**
   * Routes one keydown: lets editable fields inside the menu type, stops every
   * other key from reaching editor listeners, keeps browser shortcuts working,
   * then closes on Escape or forwards the key as menu navigation.
   *
   * @param event Browser keydown in the capture phase.
   */
  private handleKeyDown(event: KeyboardEvent): void {
    const owner = this.resolveAttachedOwner();
    if (!owner || MenuKeyboardCapture.isEditableTargetInside(owner.getElement(), event.target)) {
      return;
    }
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (MenuKeyboardCapture.isBrowserShortcut(event)) {
      return;
    }
    event.preventDefault();
    if (MenuKeyboardCapture.isEscapeKeyEvent(event)) {
      owner.requestClose();
      return;
    }
    owner.navigate(event);
  }

  /**
   * Cancels Space keyup activation of a focused trigger button so Space cannot
   * toggle the menu; propagation continues so key-up tracking stays correct.
   *
   * @param event Browser keyup in the capture phase.
   */
  private handleKeyUp(event: KeyboardEvent): void {
    const owner = this.resolveAttachedOwner();
    if (!owner || MenuKeyboardCapture.isEditableTargetInside(owner.getElement(), event.target)) {
      return;
    }
    if (event.code === 'Space' || event.key === ' ') {
      event.preventDefault();
    }
  }

  /** Closes the menu when its window loses focus, like native menus. */
  private handleWindowBlur(): void {
    this.resolveAttachedOwner()?.requestClose();
  }

  /**
   * Returns the owner while its root is still on the page. A root removed
   * without closing ends the capture so a discarded menu never swallows keys.
   *
   * @returns Attached owner, or null when inactive or detached.
   */
  private resolveAttachedOwner(): MenuKeyboardCaptureOwner | null {
    const owner = this.owner;
    if (!owner) {
      return null;
    }
    if (!owner.getElement().isConnected) {
      this.end();
      return null;
    }
    return owner;
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
   * Returns whether a key press is a browser-level shortcut that keeps its
   * browser action while a menu is open: F1-F24 (reload, fullscreen, devtools),
   * Ctrl/Meta+R reload, Ctrl/Meta+Shift+I/J/C devtools, and Ctrl/Meta zoom.
   *
   * @param event Browser keyboard event.
   * @returns True when the default action must not be prevented.
   */
  static isBrowserShortcut(event: KeyboardEvent): boolean {
    if (FUNCTION_KEY_PATTERN.test(event.key) || FUNCTION_KEY_PATTERN.test(event.code)) {
      return true;
    }
    if (!event.ctrlKey && !event.metaKey) {
      return false;
    }
    if (event.code === 'KeyR' || BROWSER_ZOOM_CODES.has(event.code)) {
      return !event.altKey;
    }
    return event.shiftKey && BROWSER_DEVTOOLS_CODES.has(event.code);
  }

  /**
   * Returns whether an event target is a text field or editable element inside
   * the menu. Uses structural checks so detached popup nodes match too.
   *
   * @param menuElement Root menu element.
   * @param target Keyboard event target.
   * @returns True when the key belongs to an editable control in the menu.
   */
  private static isEditableTargetInside(menuElement: HTMLElement, target: EventTarget | null): boolean {
    if (!doesElementContainEventTarget(menuElement, target)) {
      return false;
    }
    const element = target as HTMLElement;
    const tag = element.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable === true;
  }
}
