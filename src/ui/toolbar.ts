import { Theme } from '../theme.js';

/**
 * Horizontal application toolbar with Fluent-inspired dark styling.
 * Supports wrapping rows, dropdown menus, and active button states.
 */
export class Toolbar {
  private container: HTMLElement;
  private buttons: HTMLButtonElement[];
  private openMenu: HTMLElement | null;

  /**
   * Creates a new toolbar and appends it to the given container.
   * @param container The parent DOM element to append the toolbar into.
   */
  constructor(container: HTMLElement) {
    this.container = document.createElement('div');
    this.buttons = [];
    this.openMenu = null;
    this.applyStyles();
    container.appendChild(this.container);
    document.addEventListener('pointerdown', (event) => {
      this.handleDocumentPointerDown(event);
    });
  }

  /**
   * Adds a button to the toolbar with a label and click handler.
   * @param label The text displayed on the button.
   * @param onClick The callback invoked when the button is clicked.
   * @returns The created button element.
   */
  addButton(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.title = label;
    button.addEventListener('click', onClick);
    this.applyButtonStyles(button);
    this.container.appendChild(button);
    this.buttons.push(button);
    return button;
  }

  /**
   * Adds a dropdown menu with multiple actions under a single header button.
   * @param label The dropdown header label.
   * @param items The menu item labels and handlers.
   * @returns The header button element.
   */
  addDropdown(
    label: string,
    items: Array<{ label: string; onClick: () => void }>
  ): HTMLButtonElement {
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    wrapper.style.display = 'inline-flex';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${label} ▾`;
    button.title = label;
    this.applyButtonStyles(button);
    const menu = this.createDropdownMenu(items);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      this.toggleDropdownMenu(menu);
    });
    wrapper.appendChild(button);
    wrapper.appendChild(menu);
    this.container.appendChild(wrapper);
    this.buttons.push(button);
    return button;
  }

  /**
   * Adds a visual separator between toolbar groups.
   */
  addSeparator(): void {
    const separator = document.createElement('div');
    this.applySeparatorStyles(separator);
    this.container.appendChild(separator);
  }

  /**
   * Sets whether a specific button should appear active (selected).
   * @param index The button index in the toolbar.
   * @param active Whether the button should be highlighted as active.
   */
  setButtonActive(index: number, active: boolean): void {
    if (index < 0 || index >= this.buttons.length) return;
    this.applyActiveVisual(this.buttons[index], active);
  }

  /**
   * Finds the first button whose label starts with the given text and sets active state.
   * @param labelPrefix The button label prefix to match.
   * @param active Whether the button should appear active.
   */
  setButtonActiveByLabel(labelPrefix: string, active: boolean): void {
    const button = this.buttons.find((entry) =>
      (entry.textContent || '').startsWith(labelPrefix)
    );
    if (!button) return;
    this.applyActiveVisual(button, active);
  }

  /**
   * Returns the total number of buttons in the toolbar.
   * @returns The button count.
   */
  getButtonCount(): number {
    return this.buttons.length;
  }

  /**
   * Returns the index of the first button whose label starts with the prefix.
   * @param labelPrefix The label prefix to search for.
   * @returns The button index, or -1 if not found.
   */
  getButtonIndexByLabel(labelPrefix: string): number {
    return this.buttons.findIndex((entry) =>
      (entry.textContent || '').startsWith(labelPrefix)
    );
  }

  /**
   * Disposes the toolbar by removing it from the DOM.
   */
  dispose(): void {
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.buttons = [];
    this.openMenu = null;
  }

  /**
   * Applies the toolbar container styles with wrapping to avoid off-screen overflow.
   */
  private applyStyles(): void {
    const start = this.hexToRgba(Theme.toolbarBackground);
    const end = this.hexToRgba(Theme.toolbarBackgroundEnd);
    this.container.style.display = 'flex';
    this.container.style.flexWrap = 'wrap';
    this.container.style.alignItems = 'center';
    this.container.style.justifyContent = 'flex-start';
    this.container.style.minHeight = `${Theme.toolbarHeightPx}px`;
    this.container.style.padding = '6px 10px';
    this.container.style.gap = '6px';
    this.container.style.rowGap = '6px';
    this.container.style.background = `linear-gradient(180deg, ${start} 0%, ${end} 100%)`;
    this.container.style.borderBottom = `1px solid ${this.hexToRgba(Theme.separatorColor)}`;
    this.container.style.boxShadow = '0 1px 0 rgba(255,255,255,0.04) inset';
    this.container.style.userSelect = 'none';
    this.container.style.maxWidth = '100%';
    this.container.style.flexShrink = '0';
    this.container.style.fontFamily = Theme.uiFontFamily;
  }

  /**
   * Applies styles to individual toolbar buttons.
   * @param button The button element to style.
   */
  private applyButtonStyles(button: HTMLButtonElement): void {
    button.style.padding = '6px 12px';
    button.style.border = '1px solid rgba(255,255,255,0.08)';
    button.style.borderRadius = '6px';
    button.style.background = this.hexToRgba(Theme.buttonBackground);
    button.style.color = Theme.buttonTextColor;
    button.style.cursor = 'pointer';
    button.style.fontFamily = Theme.uiFontFamily;
    button.style.fontSize = '12px';
    button.style.fontWeight = '500';
    button.style.letterSpacing = '0.01em';
    button.style.whiteSpace = 'nowrap';
    button.style.boxShadow = '0 1px 0 rgba(0,0,0,0.25)';
    button.style.transition = 'background 80ms ease, border-color 80ms ease';
    button.addEventListener('mouseenter', () => {
      if (button.dataset.active !== 'true') {
        button.style.background = this.hexToRgba(Theme.buttonHoverColor);
        button.style.borderColor = 'rgba(255,255,255,0.14)';
      }
    });
    button.addEventListener('mouseleave', () => {
      if (button.dataset.active !== 'true') {
        button.style.background = this.hexToRgba(Theme.buttonBackground);
        button.style.borderColor = 'rgba(255,255,255,0.08)';
      }
    });
  }

  /**
   * Applies selected/unselected visuals to a toolbar button.
   * @param button The button to update.
   * @param active Whether the button is selected.
   */
  private applyActiveVisual(button: HTMLButtonElement, active: boolean): void {
    button.dataset.active = active ? 'true' : 'false';
    if (active) {
      button.style.background = this.hexToRgba(Theme.selectionColor);
      button.style.borderColor = this.hexToRgba(Theme.selectionColor);
      button.style.color = '#ffffff';
      button.style.boxShadow = '0 0 0 1px rgba(232,106,23,0.35)';
    } else {
      button.style.background = this.hexToRgba(Theme.buttonBackground);
      button.style.borderColor = 'rgba(255,255,255,0.08)';
      button.style.color = Theme.buttonTextColor;
      button.style.boxShadow = '0 1px 0 rgba(0,0,0,0.25)';
    }
  }

  /**
   * Applies styles to separator elements.
   * @param separator The separator element to style.
   */
  private applySeparatorStyles(separator: HTMLElement): void {
    separator.style.width = '1px';
    separator.style.height = '22px';
    separator.style.background = 'rgba(255,255,255,0.12)';
    separator.style.margin = '0 4px';
    separator.style.flexShrink = '0';
  }

  /**
   * Creates a dropdown menu panel for the given items.
   * @param items The menu items to render.
   * @returns The menu container element.
   */
  private createDropdownMenu(
    items: Array<{ label: string; onClick: () => void }>
  ): HTMLElement {
    const menu = document.createElement('div');
    menu.style.display = 'none';
    menu.style.position = 'absolute';
    menu.style.top = 'calc(100% + 4px)';
    menu.style.left = '0';
    menu.style.zIndex = '1000';
    menu.style.minWidth = '160px';
    menu.style.background = this.hexToRgba(Theme.toolbarBackground);
    menu.style.border = '1px solid rgba(255,255,255,0.1)';
    menu.style.borderRadius = '8px';
    menu.style.boxShadow = '0 8px 24px rgba(0,0,0,0.55)';
    menu.style.padding = '6px';
    items.forEach((item) => {
      const entry = document.createElement('button');
      entry.type = 'button';
      entry.textContent = item.label;
      this.applyButtonStyles(entry);
      entry.style.display = 'block';
      entry.style.width = '100%';
      entry.style.textAlign = 'left';
      entry.style.marginBottom = '2px';
      entry.style.boxShadow = 'none';
      entry.addEventListener('click', (event) => {
        event.stopPropagation();
        item.onClick();
        this.closeOpenMenu();
      });
      menu.appendChild(entry);
    });
    return menu;
  }

  /**
   * Toggles a dropdown menu open or closed.
   * @param menu The menu element to toggle.
   */
  private toggleDropdownMenu(menu: HTMLElement): void {
    if (this.openMenu === menu) {
      this.closeOpenMenu();
      return;
    }
    this.closeOpenMenu();
    menu.style.display = 'block';
    this.openMenu = menu;
  }

  /**
   * Closes the currently open dropdown menu if any.
   */
  private closeOpenMenu(): void {
    if (!this.openMenu) return;
    this.openMenu.style.display = 'none';
    this.openMenu = null;
  }

  /**
   * Closes dropdowns when the user clicks outside the toolbar.
   * @param event The document pointer event.
   */
  private handleDocumentPointerDown(event: Event): void {
    if (!this.openMenu) return;
    const target = event.target as Node | null;
    if (target && this.container.contains(target)) return;
    this.closeOpenMenu();
  }

  /**
   * Converts a hex color number to an rgb CSS string.
   * @param hex The hex color value.
   * @returns An rgb CSS color string.
   */
  private hexToRgba(hex: number): string {
    const r = (hex >> 16) & 255;
    const g = (hex >> 8) & 255;
    const b = hex & 255;
    return `rgb(${r}, ${g}, ${b})`;
  }
}
