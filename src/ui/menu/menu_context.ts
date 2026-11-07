import { MenuOutsidePointerClose } from './menu_outside_pointer_close.js';
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
    }
  | {
      /** Non-interactive section caption. */
      kind: 'heading';
      label: string;
    };

/**
 * Floating context menu that opens a list of actions at a screen position and
 * closes after an item is chosen, any pointer press outside the menu, or Escape
 * (handled by the underlying menu panel).
 */
export class MenuContext {
  private panel: PanelMenu;
  private isVisible: boolean;
  private readonly outsidePointerClose: MenuOutsidePointerClose;

  /**
   * Creates a new context menu with the given items.
   *
   * @param _container Host element argument; accepted and unused.
   * @param items The menu items to display.
   */
  constructor(_container: HTMLElement, items: MenuContextItem[]) {
    void _container;
    this.isVisible = false;
    this.panel = new PanelMenu(this.toMenuEntries(items), () => this.hide());
    this.outsidePointerClose = new MenuOutsidePointerClose();
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
    this.panel.openAt(x, y, document);
    this.outsidePointerCloseBegin();
  }

  /** Hides the menu and stops listening for outside pointer presses. */
  hide(): void {
    if (!this.isVisible) return;
    this.isVisible = false;
    this.outsidePointerClose.end();
    this.panel.close();
  }

  /**
   * Hides the menu on any pointer press outside it, including presses on
   * viewports whose handlers prevent the default mouse events.
   */
  private outsidePointerCloseBegin(): void {
    const menuElement = this.panel.getElement();
    const ownerWindow = menuElement.ownerDocument.defaultView ?? window;
    this.outsidePointerClose.begin(
      ownerWindow,
      (target) => MenuOutsidePointerClose.isTargetInsideSurfaces([menuElement], target),
      () => this.hide(),
    );
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
    if (item.kind === 'heading') return { kind: 'heading', label: item.label };
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
}
