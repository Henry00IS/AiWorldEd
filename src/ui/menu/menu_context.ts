import { PanelMenu } from './panel_menu.js';
import type { ToolbarMenuEntry } from './menu_types.js';

/**
 * A single item in a context menu: either an action row or a horizontal
 * separator.
 */
export type MenuContextItem =
  | {
      /** Clickable row (default when kind is omitted). */
      kind?: 'action';
      /** The display label for the menu item. */
      label: string;
      /** The callback function invoked when the item is clicked. */
      callback: () => void;
      /** Whether the item should be disabled and non-interactive. */
      disabled?: boolean;
    }
  | {
      /** Horizontal separator between sections. */
      kind: 'separator';
    };

/**
 * Floating context menu that opens a list of actions at a screen position and
 * closes after an item is chosen, a click outside the menu, or Escape.
 */
export class MenuContext {
  private panel: PanelMenu;
  private isVisible: boolean;
  private outsideClickListener: (event: MouseEvent) => void;
  private keydownListener: (event: KeyboardEvent) => void;
  private ownerDocument: Document;

  /**
   * Creates a new context menu with the given items.
   *
   * @param _container Host element argument; accepted and unused.
   * @param items The menu items to display.
   */
  constructor(_container: HTMLElement, items: MenuContextItem[]) {
    void _container;
    this.isVisible = false;
    this.ownerDocument = document;
    this.panel = new PanelMenu(this.toMenuEntries(items), () => this.hide());
    this.outsideClickListener = (event: MouseEvent) => this.onOutsideClick(event);
    this.keydownListener = (event: KeyboardEvent) => this.onKeyDown(event);
  }

  /**
   * Returns the menu panel root element.
   *
   * @returns Menu panel DOM node.
   */
  getElement(): HTMLElement {
    return this.panel.getElement();
  }

  /**
   * Shows the menu at the specified screen coordinates.
   *
   * @param x The horizontal screen position.
   * @param y The vertical screen position.
   */
  show(x: number, y: number): void {
    if (this.isVisible) return;
    this.isVisible = true;
    this.ownerDocument = document;
    this.panel.openAt(x, y, this.ownerDocument);
    this.ownerDocument.addEventListener('mousedown', this.outsideClickListener, true);
    this.ownerDocument.addEventListener('keydown', this.keydownListener, true);
  }

  /** Hides the menu and removes the outside-click and keydown listeners. */
  hide(): void {
    if (!this.isVisible) return;
    this.isVisible = false;
    this.panel.close();
    this.ownerDocument.removeEventListener('mousedown', this.outsideClickListener, true);
    this.ownerDocument.removeEventListener('keydown', this.keydownListener, true);
  }

  /** Hides the menu if visible and disposes the underlying panel. */
  dispose(): void {
    this.hide();
    this.panel.dispose();
  }

  /**
   * Converts each context menu item into a toolbar menu entry.
   *
   * @param items Context menu items to convert.
   * @returns The converted entries.
   */
  private toMenuEntries(items: MenuContextItem[]): ToolbarMenuEntry[] {
    return items.map((item) => this.toMenuEntry(item));
  }

  /**
   * Converts one context menu item into a toolbar menu entry. Separator kinds
   * and items whose label is `'---'` become separator entries. Disabled actions
   * become actions whose enablement check always returns false.
   *
   * @param item Context menu item to convert.
   * @returns The converted toolbar menu entry.
   */
  private toMenuEntry(item: MenuContextItem): ToolbarMenuEntry {
    if (item.kind === 'separator') {
      return { kind: 'separator' };
    }
    if (item.label === '---') {
      return { kind: 'separator' };
    }
    const disabled = item.disabled === true;
    if (disabled) {
      return {
        kind: 'action',
        label: item.label,
        onClick: item.callback,
        isEnabled: () => false,
      };
    }
    return {
      kind: 'action',
      label: item.label,
      onClick: item.callback,
    };
  }

  /**
   * Hides the menu when the mouse event target is outside the menu element.
   *
   * @param event The mouse event to inspect.
   */
  private onOutsideClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Node)) {
      this.hide();
      return;
    }
    if (this.panel.getElement().contains(target)) return;
    this.hide();
  }

  /**
   * Hides the menu when Escape is pressed and prevents the default key action.
   *
   * @param event The keyboard event to inspect.
   */
  private onKeyDown(event: KeyboardEvent): void {
    if (event.code === 'Escape') {
      event.preventDefault();
      this.hide();
    }
  }
}
