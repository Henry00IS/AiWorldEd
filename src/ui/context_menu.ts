import { Theme } from '../theme.js';
import { hexToRgb } from '../utils/color_utils.js';

/**
 * A single item in a context menu.
 */
export interface ContextMenuItem {
  /** The display label for the menu item. */
  label: string;

  /** The callback function invoked when the item is clicked. */
  callback: () => void;

  /** Whether the item should be disabled and non-interactive. */
  disabled?: boolean;
}

/**
 * Floating context menu component.
 * Displays a list of items at a specified position.
 * Auto-hides after selection, outside click, or Escape key.
 */
export class ContextMenu {
  private menuElement: HTMLElement;
  private items: ContextMenuItem[];
  private isVisible: boolean;
  private outsideClickListener: (event: MouseEvent) => void;
  private keydownListener: (event: KeyboardEvent) => void;

  /**
   * Creates a new context menu component.
   * @param container The parent DOM element to attach the menu to.
   * @param items The menu items to display.
   */
  constructor(container: HTMLElement, items: ContextMenuItem[]) {
    this.items = items;
    this.isVisible = false;
    this.menuElement = this.createMenuElement();
    this.renderItems();
    this.outsideClickListener = (event: MouseEvent) => this.onOutsideClick(event);
    this.keydownListener = (event: KeyboardEvent) => this.onKeyDown(event);
    container.appendChild(this.menuElement);
  }

  /**
   * Shows the menu at the specified screen coordinates.
   * @param x The horizontal screen position.
   * @param y The vertical screen position.
   */
  show(x: number, y: number): void {
    if (this.isVisible) return;
    this.isVisible = true;
    this.menuElement.style.left = `${x}px`;
    this.menuElement.style.top = `${y}px`;
    this.menuElement.style.display = 'block';
    document.addEventListener('mousedown', this.outsideClickListener);
    document.addEventListener('keydown', this.keydownListener);
  }

  /**
   * Hides the menu and removes global event listeners.
   */
  hide(): void {
    if (!this.isVisible) return;
    this.isVisible = false;
    this.menuElement.style.display = 'none';
    document.removeEventListener('mousedown', this.outsideClickListener);
    document.removeEventListener('keydown', this.keydownListener);
  }

  /**
   * Disposes the menu and removes it from the DOM.
   */
  dispose(): void {
    this.hide();
    if (this.menuElement.parentNode) {
      this.menuElement.parentNode.removeChild(this.menuElement);
    }
  }

  /**
   * Creates the root menu DOM element with styles.
   * @returns The styled menu container element.
   */
  private createMenuElement(): HTMLElement {
    const el = document.createElement('div');
    el.style.position = 'fixed';
    el.style.display = 'none';
    el.style.zIndex = '9999';
    el.style.background = hexToRgb(Theme.toolbarBackground);
    el.style.border = `1px solid ${hexToRgb(Theme.separatorColor)}`;
    el.style.borderRadius = '4px';
    el.style.padding = '4px 0';
    el.style.minWidth = '140px';
    el.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.5)';
    el.style.fontFamily = 'monospace';
    el.style.fontSize = '12px';
    return el;
  }

  /**
   * Renders all menu items into the menu element.
   */
  private renderItems(): void {
    this.items.forEach((item) => {
      const itemElement = this.createItemElement(item);
      this.menuElement.appendChild(itemElement);
    });
  }

  /**
   * Creates a single clickable menu item element.
   * @param item The context menu item data.
   * @returns The styled and event-bound DOM element.
   */
  private createItemElement(item: ContextMenuItem): HTMLElement {
    const el = document.createElement('div');
    el.textContent = item.label;
    el.style.padding = '6px 16px';
    el.style.cursor = item.disabled ? 'default' : 'pointer';
    el.style.color = this.getItemTextColor(item);
    this.bindItemEvents(item, el);
    return el;
  }

  /**
   * Returns the text color for a menu item based on its state.
   * @param item The context menu item.
   * @returns The CSS color string for the item text.
   */
  private getItemTextColor(item: ContextMenuItem): string {
    if (item.disabled) {
      return '#555555';
    }
    return Theme.buttonTextColor;
  }

  /**
   * Binds mouse events to a menu item element.
   * @param item The context menu item data.
   * @param el The DOM element to bind events to.
   */
  private bindItemEvents(item: ContextMenuItem, el: HTMLElement): void {
    el.addEventListener('mouseenter', () => {
      if (!item.disabled) {
        el.style.background = hexToRgb(Theme.buttonHoverColor);
      }
    });
    el.addEventListener('mouseleave', () => {
      el.style.background = 'transparent';
    });
    el.addEventListener('click', () => {
      if (!item.disabled) {
        item.callback();
        this.hide();
      }
    });
  }

  /**
   * Handles mouse clicks outside the menu area.
   * @param event The mouse event to inspect.
   */
  private onOutsideClick(event: MouseEvent): void {
    if (!this.menuElement.contains(event.target as Node)) {
      this.hide();
    }
  }

  /**
    * Handles keyboard events to detect Escape key presses.
    * @param event The keyboard event to inspect.
    */
  private onKeyDown(event: KeyboardEvent): void {
    if (event.code === 'Escape') {
      this.hide();
    }
  }
}
