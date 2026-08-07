import { doesElementContainEventTarget } from '@/utils/dom_node_realm.js';

/**
 * Capture-phase outside pointer-down closer for menus anchored to a trigger.
 * Listens on the owner window so detached popup menus close correctly.
 */
export class MenuOutsidePointerClose {
  private ownerWindow: Window | null;
  private closer: ((event: PointerEvent) => void) | null;

  /** Creates an inactive outside-pointer closer. */
  constructor() {
    this.ownerWindow = null;
    this.closer = null;
  }

  /**
   * Starts listening for pointer presses outside the safe regions.
   *
   * @param ownerWindow Window that owns the menu (main or detached).
   * @param isInsideTarget Returns true when the press is inside the control or
   *   menu.
   * @param onOutside Invoked when the press is outside all safe regions.
   */
  begin(ownerWindow: Window, isInsideTarget: (target: EventTarget | null) => boolean, onOutside: () => void): void {
    this.end();
    this.ownerWindow = ownerWindow;
    this.closer = (event) => {
      if (isInsideTarget(event.target)) {
        return;
      }
      onOutside();
    };
    this.ownerWindow.addEventListener('pointerdown', this.closer, true);
  }

  /** Removes the capture-phase listener when active. */
  end(): void {
    if (!this.closer || !this.ownerWindow) {
      this.closer = null;
      this.ownerWindow = null;
      return;
    }
    this.ownerWindow.removeEventListener('pointerdown', this.closer, true);
    this.closer = null;
    this.ownerWindow = null;
  }

  /**
   * Returns whether a target lies inside any of the given surfaces.
   *
   * @param surfaces Elements that should keep the menu open.
   * @param target Event target from a pointer event.
   * @returns True when the target is inside at least one surface.
   */
  static isTargetInsideSurfaces(
    surfaces: readonly (HTMLElement | null | undefined)[],
    target: EventTarget | null,
  ): boolean {
    for (const surface of surfaces) {
      if (surface && doesElementContainEventTarget(surface, target)) {
        return true;
      }
    }
    return false;
  }
}
