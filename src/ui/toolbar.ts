import { Theme } from '../theme.js';

/**
 * Horizontal application toolbar with a compact, modern dark chrome.
 * Supports text buttons, icon buttons, dropdown menus, and active states.
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
   * Adds a text button to the toolbar with a label and click handler.
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
    this.applyButtonStyles(button, false);
    this.container.appendChild(button);
    this.buttons.push(button);
    return button;
  }

  /**
   * Adds a compact icon-only button with a tooltip label.
   * @param label Accessible name and tooltip text.
   * @param iconSvg Inline SVG markup for the icon.
   * @param onClick Click handler.
   * @returns The created button element.
   */
  addIconButton(
    label: string,
    iconSvg: string,
    onClick: () => void
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.innerHTML = iconSvg;
    button.addEventListener('click', onClick);
    this.applyButtonStyles(button, true);
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
    button.textContent = label;
    button.title = label;
    this.applyButtonStyles(button, false);
    this.appendDropdownCaret(button);
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
   * Finds the first button whose label or aria-label starts with the given text.
   * @param labelPrefix The button label prefix to match.
   * @param active Whether the button should appear active.
   */
  setButtonActiveByLabel(labelPrefix: string, active: boolean): void {
    const button = this.findButtonByLabelPrefix(labelPrefix);
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
    return this.buttons.findIndex((entry) => this.buttonMatchesPrefix(entry, labelPrefix));
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
   * Applies the toolbar container styles as a single compact strip.
   */
  private applyStyles(): void {
    const start = this.hexToRgba(Theme.toolbarBackground);
    const end = this.hexToRgba(Theme.toolbarBackgroundEnd);
    this.container.style.display = 'flex';
    this.container.style.flexWrap = 'wrap';
    this.container.style.alignItems = 'center';
    this.container.style.justifyContent = 'flex-start';
    this.container.style.minHeight = `${Theme.toolbarHeightPx}px`;
    this.container.style.padding = '4px 8px';
    this.container.style.gap = '4px';
    this.container.style.rowGap = '4px';
    this.container.style.background = `linear-gradient(180deg, ${start} 0%, ${end} 100%)`;
    this.container.style.borderBottom = `1px solid ${this.hexToRgba(Theme.separatorColor)}`;
    this.container.style.boxShadow = 'inset 0 -1px 0 rgba(255,255,255,0.03)';
    this.container.style.userSelect = 'none';
    this.container.style.maxWidth = '100%';
    this.container.style.flexShrink = '0';
    this.container.style.fontFamily = Theme.uiFontFamily;
  }

  /**
   * Applies styles to individual toolbar buttons.
   * @param button The button element to style.
   * @param iconOnly Whether the button is an icon-only control.
   */
  private applyButtonStyles(button: HTMLButtonElement, iconOnly: boolean): void {
    button.style.display = 'inline-flex';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';
    button.style.gap = '4px';
    button.style.padding = iconOnly ? '0' : '5px 10px';
    button.style.minWidth = iconOnly ? '30px' : '0';
    button.style.height = '28px';
    button.style.border = '1px solid transparent';
    button.style.borderRadius = '5px';
    button.style.background = 'transparent';
    button.style.color = Theme.buttonTextColor;
    button.style.cursor = 'pointer';
    button.style.fontFamily = Theme.uiFontFamily;
    button.style.fontSize = '12px';
    button.style.fontWeight = '500';
    button.style.letterSpacing = '0.01em';
    button.style.whiteSpace = 'nowrap';
    button.style.boxShadow = 'none';
    button.style.transition = 'background 80ms ease, border-color 80ms ease, color 80ms ease';
    button.addEventListener('mouseenter', () => {
      if (button.dataset.active !== 'true') {
        button.style.background = this.hexToRgba(Theme.buttonHoverColor);
        button.style.borderColor = 'rgba(255,255,255,0.06)';
      }
    });
    button.addEventListener('mouseleave', () => {
      if (button.dataset.active !== 'true') {
        button.style.background = 'transparent';
        button.style.borderColor = 'transparent';
      }
    });
  }

  /**
   * Appends a subtle dropdown caret to a menu header button.
   * @param button Dropdown header button.
   */
  private appendDropdownCaret(button: HTMLButtonElement): void {
    const caret = document.createElement('span');
    caret.textContent = '▾';
    caret.style.fontSize = '9px';
    caret.style.opacity = '0.7';
    caret.style.marginLeft = '2px';
    button.appendChild(caret);
  }

  /**
   * Applies selected/unselected visuals to a toolbar button.
   * @param button The button to update.
   * @param active Whether the button is selected.
   */
  private applyActiveVisual(button: HTMLButtonElement, active: boolean): void {
    button.dataset.active = active ? 'true' : 'false';
    if (active) {
      button.style.background = 'rgba(232, 106, 23, 0.22)';
      button.style.borderColor = this.hexToRgba(Theme.selectionColor);
      button.style.color = '#ffffff';
      button.style.boxShadow = 'none';
    } else {
      button.style.background = 'transparent';
      button.style.borderColor = 'transparent';
      button.style.color = Theme.buttonTextColor;
      button.style.boxShadow = 'none';
    }
  }

  /**
   * Applies styles to separator elements.
   * @param separator The separator element to style.
   */
  private applySeparatorStyles(separator: HTMLElement): void {
    separator.style.width = '1px';
    separator.style.height = '18px';
    separator.style.background = 'rgba(255,255,255,0.1)';
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
    menu.style.minWidth = '168px';
    menu.style.background = this.hexToRgba(Theme.toolbarBackground);
    menu.style.border = '1px solid rgba(255,255,255,0.1)';
    menu.style.borderRadius = '8px';
    menu.style.boxShadow = '0 10px 28px rgba(0,0,0,0.55)';
    menu.style.padding = '4px';
    items.forEach((item) => {
      const entry = document.createElement('button');
      entry.type = 'button';
      entry.textContent = item.label;
      this.applyMenuItemStyles(entry);
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
   * Styles a dropdown menu entry as a full-width list row.
   * @param entry Menu item button.
   */
  private applyMenuItemStyles(entry: HTMLButtonElement): void {
    entry.style.display = 'block';
    entry.style.width = '100%';
    entry.style.textAlign = 'left';
    entry.style.padding = '7px 10px';
    entry.style.margin = '0';
    entry.style.border = '1px solid transparent';
    entry.style.borderRadius = '5px';
    entry.style.background = 'transparent';
    entry.style.color = Theme.buttonTextColor;
    entry.style.cursor = 'pointer';
    entry.style.fontFamily = Theme.uiFontFamily;
    entry.style.fontSize = '12px';
    entry.style.fontWeight = '500';
    entry.addEventListener('mouseenter', () => {
      entry.style.background = this.hexToRgba(Theme.buttonHoverColor);
    });
    entry.addEventListener('mouseleave', () => {
      entry.style.background = 'transparent';
    });
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
   * Finds a toolbar button by label or aria-label prefix.
   * @param labelPrefix Prefix to match.
   * @returns Matching button or undefined.
   */
  private findButtonByLabelPrefix(labelPrefix: string): HTMLButtonElement | undefined {
    return this.buttons.find((entry) => this.buttonMatchesPrefix(entry, labelPrefix));
  }

  /**
   * Returns whether a button's visible label or aria-label starts with the prefix.
   * @param button Button to inspect.
   * @param labelPrefix Prefix to match.
   * @returns True when the button matches.
   */
  private buttonMatchesPrefix(button: HTMLButtonElement, labelPrefix: string): boolean {
    const text = (button.textContent || '').trim();
    if (text.startsWith(labelPrefix)) return true;
    const aria = button.getAttribute('aria-label') || '';
    return aria.startsWith(labelPrefix);
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
