import { PanelMenu } from './panel_menu.js';
import { appendMenuDropdownCaret } from './menu_dropdown_caret.js';
import { MenuOutsidePointerClose } from './menu_outside_pointer_close.js';

/**
 * Shared base for controls that open a {@link PanelMenu} under a trigger button
 * and close on outside pointer-down. Subclasses supply menu entries and button
 * chrome; open/close lifecycle stays in one place.
 */
export abstract class PanelMenuDropdown {
  protected readonly ownerDocument: Document;
  protected readonly ownerWindow: Window;
  protected readonly wrapper: HTMLElement;
  protected readonly button: HTMLButtonElement;
  protected menuPanel: PanelMenu | null;
  private readonly outsideCloser: MenuOutsidePointerClose;

  /**
   * Creates dropdown chrome owned by the parent element's document.
   *
   * @param parentElement Host used to resolve owner document and window.
   */
  protected constructor(parentElement: HTMLElement) {
    this.ownerDocument = parentElement.ownerDocument;
    this.ownerWindow = parentElement.ownerDocument.defaultView ?? window;
    this.menuPanel = null;
    this.outsideCloser = new MenuOutsidePointerClose();
    this.wrapper = this.ownerDocument.createElement('div');
    this.button = this.ownerDocument.createElement('button');
    this.styleWrapperLayout();
    this.prepareTriggerButton();
  }

  /**
   * Returns the wrapper element for layout.
   *
   * @returns Wrapper element.
   */
  getElement(): HTMLElement {
    return this.wrapper;
  }

  /**
   * Returns the open menu panel when present.
   *
   * @returns PanelMenu instance, or null.
   */
  getMenuPanel(): PanelMenu | null {
    return this.menuPanel;
  }

  /** Closes the menu, disposes the panel, and removes the wrapper. */
  dispose(): void {
    this.closeMenu();
    this.menuPanel?.dispose();
    this.menuPanel = null;
    this.wrapper.remove();
  }

  /**
   * Rebuilds the menu panel so entries stay current. Subclasses assign
   * {@link menuPanel} and attach it under the wrapper.
   */
  protected abstract rebuildMenuPanel(): void;

  /** Styles the closed trigger button. */
  protected abstract styleTriggerButton(): void;

  /** Opens or closes the menu. */
  protected toggleMenu(): void {
    if (this.menuPanel?.isOpen()) {
      this.closeMenu();
      return;
    }
    this.openMenu();
  }

  /** Shows the menu under the trigger and listens for outside presses. */
  protected openMenu(): void {
    this.rebuildMenuPanel();
    if (!this.menuPanel) {
      return;
    }
    this.menuPanel.open(this.button);
    this.button.setAttribute('aria-expanded', 'true');
    this.beginOutsideCloser();
  }

  /** Hides the menu and removes outside-press listeners. */
  protected closeMenu(): void {
    this.menuPanel?.close();
    this.button.setAttribute('aria-expanded', 'false');
    this.outsideCloser.end();
  }

  /**
   * Appends a dropdown caret to the trigger button.
   *
   * @param button Button receiving the caret.
   */
  protected appendCaret(button: HTMLButtonElement): void {
    appendMenuDropdownCaret(button, this.ownerDocument);
  }

  /** Applies relative inline-flex layout to the wrapper. */
  private styleWrapperLayout(): void {
    this.wrapper.style.position = 'relative';
    this.wrapper.style.display = 'inline-flex';
    this.wrapper.style.alignItems = 'center';
  }

  /** Configures shared trigger button attributes and click toggle. */
  private prepareTriggerButton(): void {
    this.button.type = 'button';
    this.button.setAttribute('aria-haspopup', 'menu');
    this.button.setAttribute('aria-expanded', 'false');
    this.button.addEventListener('click', (event) => {
      event.stopPropagation();
      this.toggleMenu();
    });
  }

  /** Starts the shared outside-pointer closer for this control. */
  private beginOutsideCloser(): void {
    this.outsideCloser.begin(
      this.ownerWindow,
      (target) => MenuOutsidePointerClose.isTargetInsideSurfaces([this.wrapper, this.menuPanel?.getElement()], target),
      () => this.closeMenu(),
    );
  }
}
