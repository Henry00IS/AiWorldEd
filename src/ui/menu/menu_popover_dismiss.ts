import { FloatingPanelStack } from '@/ui/floating_panel/panel_floating_stack.js';
import { MenuKeyboardCapture } from './menu_keyboard_capture.js';
import { MenuOutsidePointerClose } from './menu_outside_pointer_close.js';

/** Surfaces and callback one open popover hands to {@link MenuPopoverDismiss}. */
export interface MenuPopoverDismissTarget {
  /** Popover root that blocks viewport presses beneath it while open. */
  popover: HTMLElement;
  /** Extra controls, such as the toggle button, whose presses keep it open. */
  keepOpenSurfaces: readonly (HTMLElement | null)[];
  /** Element whose own text fields keep typing while the popover is open. */
  keyboardRoot: HTMLElement;
  /** Closes the popover after an outside press, Escape or window blur. */
  onDismiss: () => void;
}

/**
 * Dismiss behaviour of an open popover that matches root menus: any pointer
 * press outside its surfaces closes it, Escape closes it without reaching
 * editor shortcuts, and presses on it never start viewport tool presses.
 */
export class MenuPopoverDismiss {
  private readonly outsidePointerClose: MenuOutsidePointerClose;
  private readonly keyboardCapture: MenuKeyboardCapture;
  private blockedPopover: HTMLElement | null;

  /** Creates an inactive dismiss controller. */
  constructor() {
    this.outsidePointerClose = new MenuOutsidePointerClose();
    this.keyboardCapture = new MenuKeyboardCapture();
    this.blockedPopover = null;
  }

  /**
   * Starts outside-press, Escape and pointer-block handling for an open
   * popover, replacing any earlier target.
   *
   * @param target Popover surfaces and dismiss callback.
   */
  begin(target: MenuPopoverDismissTarget): void {
    this.end();
    const ownerWindow = target.popover.ownerDocument.defaultView;
    if (!ownerWindow) return;
    this.pointerBlockBegin(target.popover);
    this.outsidePointerCloseBegin(ownerWindow, target);
    this.keyboardCapture.begin(ownerWindow, {
      getElement: () => target.keyboardRoot,
      requestClose: () => target.onDismiss(),
      navigate: () => undefined,
    });
  }

  /** Stops every listener and releases the pointer block. */
  end(): void {
    this.outsidePointerClose.end();
    this.keyboardCapture.end();
    this.pointerBlockEnd();
  }

  /**
   * Returns whether a popover is currently tracked.
   *
   * @returns True between {@link begin} and {@link end}.
   */
  isActive(): boolean {
    return this.blockedPopover !== null;
  }

  /**
   * Closes the popover on a pointer press outside it and its keep-open
   * controls.
   *
   * @param ownerWindow Window hosting the popover.
   * @param target Popover surfaces and dismiss callback.
   */
  private outsidePointerCloseBegin(ownerWindow: Window, target: MenuPopoverDismissTarget): void {
    const surfaces = [target.popover, ...target.keepOpenSurfaces];
    this.outsidePointerClose.begin(
      ownerWindow,
      (eventTarget) => MenuOutsidePointerClose.isTargetInsideSurfaces(surfaces, eventTarget),
      () => target.onDismiss(),
    );
  }

  /**
   * Registers the popover so viewport hits under it do not start tool presses.
   *
   * @param popover Popover root.
   */
  private pointerBlockBegin(popover: HTMLElement): void {
    FloatingPanelStack.registerPointerBlockSurface(popover);
    this.blockedPopover = popover;
  }

  /** Unregisters the popover pointer block when one is held. */
  private pointerBlockEnd(): void {
    if (this.blockedPopover === null) return;
    FloatingPanelStack.unregisterPointerBlockSurface(this.blockedPopover);
    this.blockedPopover = null;
  }
}
