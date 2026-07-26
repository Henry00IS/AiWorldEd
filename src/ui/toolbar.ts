import { Theme } from '../theme.js';

/** One entry in a toolbar dropdown menu. */
export interface ToolbarDropdownItem {
  /** Visible menu label. */
  label: string;
  /** Invoked when the enabled item is clicked. */
  onClick: () => void;
  /**
   * Optional live enablement check evaluated when the menu opens. When omitted
   * or true, the item is clickable.
   */
  isEnabled?: () => boolean;
}

/** Three toolbar presentations available through bottom-edge dragging. */
export type ToolbarSize = 'small' | 'medium' | 'large';

const TOOLBAR_SIZES: readonly ToolbarSize[] = ['small', 'medium', 'large'];
const TOOLBAR_MIN_HEIGHTS: Readonly<Record<ToolbarSize, number>> = {
  small: 36,
  medium: Theme.toolbarHeightPx,
  large: Theme.toolbarHeightPx,
};

/**
 * Horizontal application toolbar with a compact, modern dark chrome. Supports
 * text buttons, icon buttons, dropdown menus, and active states.
 */
export class Toolbar {
  private container: HTMLElement;
  private buttons: HTMLButtonElement[];
  private openMenu: HTMLElement | null;
  private openMenuButton: HTMLButtonElement | null;
  private dropdownItemBindings: Map<HTMLElement, ToolbarDropdownItem[]>;
  private iconButtons: HTMLButtonElement[];
  private buttonLabelsEnabled: boolean;
  private size: ToolbarSize;
  private resizeStartY: number | null;
  private resizeStartIndex: number;
  private resizeHandle: HTMLElement;
  private windowMoveListener: (event: PointerEvent) => void;
  private windowUpListener: () => void;

  /**
   * Creates a new toolbar and appends it to the given container.
   *
   * @param container The parent DOM element to append the toolbar into.
   */
  constructor(container: HTMLElement) {
    this.container = document.createElement('div');
    this.container.classList.add('editor-toolbar');
    this.buttons = [];
    this.openMenu = null;
    this.openMenuButton = null;
    this.dropdownItemBindings = new Map();
    this.iconButtons = [];
    this.buttonLabelsEnabled = true;
    this.size = 'medium';
    this.resizeStartY = null;
    this.resizeStartIndex = 1;
    this.windowMoveListener = (event) => this.onResizeMove(event);
    this.windowUpListener = () => this.endResize();
    this.applyStyles();
    this.resizeHandle = this.createResizeHandle();
    this.container.appendChild(this.resizeHandle);
    this.applyToolbarSize();
    container.appendChild(this.container);
    document.addEventListener('pointerdown', (event) => {
      this.handleDocumentPointerDown(event);
    });
  }

  /**
   * Adds a text button to the toolbar with a label and click handler.
   *
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
   *
   * @param label Accessible name and tooltip text.
   * @param iconSvg Inline SVG markup for the icon.
   * @param onClick Click handler.
   * @returns The created button element.
   */
  addIconButton(label: string, iconSvg: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.innerHTML = iconSvg;
    const visibleLabel = document.createElement('span');
    visibleLabel.textContent = label;
    visibleLabel.dataset['toolbarButtonLabel'] = 'true';
    visibleLabel.style.display = 'none';
    button.appendChild(visibleLabel);
    const icon = button.querySelector('svg');
    icon?.setAttribute('width', '25');
    icon?.setAttribute('height', '25');
    button.addEventListener('click', onClick);
    this.applyButtonStyles(button, true);
    this.container.appendChild(button);
    this.buttons.push(button);
    this.iconButtons.push(button);
    this.applyIconButtonStyle(button, this.size === 'large' && this.buttonLabelsEnabled);
    return button;
  }

  /**
   * Controls whether expanded icon buttons may show their text labels.
   *
   * @param enabled Whether labels are enabled in expanded mode.
   */
  setButtonLabelsEnabled(enabled: boolean): void {
    this.buttonLabelsEnabled = enabled;
    this.refreshIconButtonAppearance();
  }

  /**
   * Applies one of the three supported toolbar sizes.
   *
   * @param size Small, medium, or large.
   */
  setSize(size: ToolbarSize): void {
    this.size = size;
    this.applyToolbarSize();
  }

  /** @returns Current snapped toolbar size. */
  getSize(): ToolbarSize {
    return this.size;
  }

  /**
   * Adds a dropdown menu with multiple actions under a single header button.
   *
   * @param label The dropdown header label.
   * @param items The menu item labels, handlers, and optional enablement.
   * @returns The header button element.
   */
  addDropdown(label: string, items: ToolbarDropdownItem[]): HTMLButtonElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('editor-toolbar-dropdown');
    wrapper.style.position = 'relative';
    wrapper.style.display = 'inline-flex';
    const button = document.createElement('button');
    button.classList.add('editor-toolbar-menu-button');
    button.type = 'button';
    button.textContent = label;
    button.title = label;
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    this.applyButtonStyles(button, false);
    this.appendDropdownCaret(button);
    const menu = this.createDropdownMenu(items);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      this.toggleDropdownMenu(menu, button);
    });
    button.addEventListener('mouseenter', () => {
      this.openDropdownOnHover(menu, button);
    });
    wrapper.appendChild(button);
    wrapper.appendChild(menu);
    this.container.appendChild(wrapper);
    this.buttons.push(button);
    return button;
  }

  /** Adds a visual separator between toolbar groups. */
  addSeparator(): void {
    const separator = document.createElement('div');
    this.applySeparatorStyles(separator);
    this.container.appendChild(separator);
  }

  /**
   * Sets whether a specific button should appear active (selected).
   *
   * @param index The button index in the toolbar.
   * @param active Whether the button should be highlighted as active.
   */
  setButtonActive(index: number, active: boolean): void {
    if (index < 0 || index >= this.buttons.length) return;
    this.applyActiveVisual(this.buttons[index]!, active);
  }

  /**
   * Finds the first button whose label or aria-label starts with the given
   * text.
   *
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
   *
   * @returns The button count.
   */
  getButtonCount(): number {
    return this.buttons.length;
  }

  /**
   * Returns the index of the first button whose label starts with the prefix.
   *
   * @param labelPrefix The label prefix to search for.
   * @returns The button index, or -1 if not found.
   */
  getButtonIndexByLabel(labelPrefix: string): number {
    return this.buttons.findIndex((entry) => this.buttonMatchesPrefix(entry, labelPrefix));
  }

  /** Disposes the toolbar by removing it from the DOM. */
  dispose(): void {
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.buttons = [];
    this.openMenu = null;
    this.openMenuButton = null;
    this.dropdownItemBindings.clear();
    this.iconButtons = [];
    window.removeEventListener('pointermove', this.windowMoveListener);
    window.removeEventListener('pointerup', this.windowUpListener);
  }

  /**
   * Creates the draggable strip along the toolbar's bottom edge.
   *
   * @returns Resize handle element.
   */
  private createResizeHandle(): HTMLElement {
    const handle = document.createElement('span');
    handle.classList.add('editor-toolbar-resize-handle');
    handle.title = 'Drag to resize toolbar';
    handle.style.position = 'absolute';
    handle.style.left = '0';
    handle.style.right = '0';
    handle.style.bottom = '0';
    handle.style.height = '6px';
    handle.style.cursor = 'ns-resize';
    handle.style.zIndex = '2';
    handle.style.borderTop = '1px solid rgba(255,255,255,0.06)';
    handle.addEventListener('pointerdown', (event) => this.beginResize(event));
    return handle;
  }

  /**
   * Begins a window-captured toolbar resize gesture.
   *
   * @param event Pointer press on the bottom resize edge.
   */
  private beginResize(event: PointerEvent): void {
    event.preventDefault();
    this.resizeStartY = event.clientY;
    this.resizeStartIndex = TOOLBAR_SIZES.indexOf(this.size);
    window.addEventListener('pointermove', this.windowMoveListener);
    window.addEventListener('pointerup', this.windowUpListener);
  }

  /**
   * Snaps live resize movement to one of the three toolbar sizes.
   *
   * @param event Window pointer movement during resizing.
   */
  private onResizeMove(event: PointerEvent): void {
    if (this.resizeStartY === null) return;
    const rowDelta = Math.round((event.clientY - this.resizeStartY) / 36);
    const nextIndex = Math.max(0, Math.min(2, this.resizeStartIndex + rowDelta));
    this.setSize(TOOLBAR_SIZES[nextIndex]!);
  }

  /** Ends the active toolbar resize gesture. */
  private endResize(): void {
    this.resizeStartY = null;
    window.removeEventListener('pointermove', this.windowMoveListener);
    window.removeEventListener('pointerup', this.windowUpListener);
  }

  /** Applies the snapped presentation without reserving unused toolbar rows. */
  private applyToolbarSize(): void {
    this.container.style.height = 'auto';
    this.container.style.minHeight = `${TOOLBAR_MIN_HEIGHTS[this.size]}px`;
    this.container.style.padding = this.size === 'small' ? '3px 8px 7px' : '4px 8px 8px';
    this.refreshIconButtonAppearance();
  }

  /** Applies icon and text visibility for the current toolbar state. */
  private refreshIconButtonAppearance(): void {
    const showLabels = this.size === 'large' && this.buttonLabelsEnabled;
    this.iconButtons.forEach((button) => this.applyIconButtonStyle(button, showLabels));
  }

  /**
   * Applies the current state presentation to one icon button.
   *
   * @param button Icon button to update.
   * @param showLabel Whether its text label should be visible.
   */
  private applyIconButtonStyle(button: HTMLButtonElement, showLabel: boolean): void {
    const label = button.querySelector('[data-toolbar-button-label]') as HTMLElement | null;
    const icon = button.querySelector('svg');
    const iconSize = this.size === 'small' ? '16' : '25';
    if (label) label.style.display = showLabel ? '' : 'none';
    if (icon) icon.style.display = showLabel ? 'none' : '';
    icon?.setAttribute('width', iconSize);
    icon?.setAttribute('height', iconSize);
    button.style.width = showLabel ? 'auto' : '';
    button.style.padding = showLabel ? '0 8px' : '0';
    button.style.minWidth = this.size === 'small' ? '24px' : showLabel ? '0' : '30px';
    button.style.height = this.size === 'small' ? '24px' : '28px';
  }

  /** Applies the toolbar container styles as a single compact strip. */
  private applyStyles(): void {
    const start = this.hexToRgba(Theme.toolbarBackground);
    const end = this.hexToRgba(Theme.toolbarBackgroundEnd);
    this.container.style.display = 'flex';
    this.container.style.position = 'relative';
    this.container.style.flexWrap = 'wrap';
    this.container.style.alignItems = 'center';
    this.container.style.alignContent = 'flex-start';
    this.container.style.justifyContent = 'flex-start';
    this.container.style.minHeight = `${Theme.toolbarHeightPx}px`;
    this.container.style.padding = '4px 8px 8px';
    this.container.style.gap = '4px';
    this.container.style.rowGap = '4px';
    this.container.style.background = `linear-gradient(180deg, ${start} 0%, ${end} 100%)`;
    this.container.style.borderBottom = `1px solid ${this.hexToRgba(Theme.separatorColor)}`;
    this.container.style.boxShadow = 'inset 0 -1px 0 rgba(255,255,255,0.03)';
    this.container.style.userSelect = 'none';
    this.container.style.maxWidth = '100%';
    this.container.style.overflow = 'visible';
    this.container.style.boxSizing = 'border-box';
    this.container.style.flexShrink = '0';
    this.container.style.zIndex = '100';
    this.container.style.fontFamily = Theme.uiFontFamily;
  }

  /**
   * Applies styles to individual toolbar buttons.
   *
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
      if (button.dataset['active'] !== 'true') {
        button.style.background = this.hexToRgba(Theme.buttonHoverColor);
        button.style.borderColor = 'rgba(255,255,255,0.06)';
      }
    });
    button.addEventListener('mouseleave', () => {
      if (button.dataset['active'] !== 'true') {
        button.style.background = 'transparent';
        button.style.borderColor = 'transparent';
      }
    });
  }

  /**
   * Appends a subtle dropdown caret to a menu header button.
   *
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
   *
   * @param button The button to update.
   * @param active Whether the button is selected.
   */
  private applyActiveVisual(button: HTMLButtonElement, active: boolean): void {
    button.dataset['active'] = active ? 'true' : 'false';
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
   *
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
   *
   * @param items The menu items to render.
   * @returns The menu container element.
   */
  private createDropdownMenu(items: ToolbarDropdownItem[]): HTMLElement {
    const menu = document.createElement('div');
    menu.classList.add('editor-toolbar-dropdown-menu');
    menu.setAttribute('role', 'menu');
    this.styleDropdownMenuPanel(menu);
    this.dropdownItemBindings.set(menu, items);
    items.forEach((item, index) => {
      const entry = document.createElement('button');
      entry.classList.add('editor-toolbar-dropdown-item');
      entry.type = 'button';
      entry.textContent = item.label;
      entry.dataset['dropdownIndex'] = String(index);
      entry.setAttribute('role', 'menuitem');
      this.applyMenuItemStyles(entry);
      entry.addEventListener('click', (event) => {
        event.stopPropagation();
        if (entry.disabled) return;
        item.onClick();
        this.closeOpenMenu();
      });
      menu.appendChild(entry);
    });
    return menu;
  }

  /**
   * Applies layout styles to a dropdown menu panel.
   *
   * @param menu Menu panel element.
   */
  private styleDropdownMenuPanel(menu: HTMLElement): void {
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
  }

  /**
   * Styles a dropdown menu entry as a full-width list row.
   *
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
      if (entry.disabled) return;
      entry.style.background = this.hexToRgba(Theme.buttonHoverColor);
    });
    entry.addEventListener('mouseleave', () => {
      entry.style.background = 'transparent';
    });
  }

  /**
   * Toggles a dropdown menu open or closed.
   *
   * @param menu The menu element to toggle.
   * @param button The header button that owns the menu.
   */
  private toggleDropdownMenu(menu: HTMLElement, button: HTMLButtonElement): void {
    if (this.openMenu === menu) {
      this.closeOpenMenu();
      return;
    }
    this.openDropdownMenu(menu, button);
  }

  /**
   * Opens a different dropdown after the pointer enters its header.
   *
   * @param menu The menu element to open.
   * @param button The header button that owns the menu.
   */
  private openDropdownOnHover(menu: HTMLElement, button: HTMLButtonElement): void {
    if (this.openMenu && this.openMenu !== menu) {
      this.openDropdownMenu(menu, button);
    }
  }

  /**
   * Opens a dropdown after closing whichever menu is currently visible.
   *
   * @param menu The menu element to open.
   * @param button The header button that owns the menu.
   */
  private openDropdownMenu(menu: HTMLElement, button: HTMLButtonElement): void {
    this.closeOpenMenu();
    this.refreshDropdownEnabledState(menu);
    menu.style.display = 'block';
    this.openMenu = menu;
    this.openMenuButton = button;
    button.setAttribute('aria-expanded', 'true');
  }

  /**
   * Re-evaluates isEnabled for each item when a dropdown opens.
   *
   * @param menu Dropdown menu panel.
   */
  private refreshDropdownEnabledState(menu: HTMLElement): void {
    const items = this.dropdownItemBindings.get(menu);
    if (!items) return;
    const buttons = menu.querySelectorAll('button');
    buttons.forEach((button, index) => {
      const item = items[index];
      if (!item) return;
      const enabled = item.isEnabled ? item.isEnabled() : true;
      this.applyDropdownItemEnabledState(button as HTMLButtonElement, enabled);
    });
  }

  /**
   * Applies enabled/disabled visuals to one dropdown entry.
   *
   * @param entry Menu item button.
   * @param enabled Whether the item can be activated.
   */
  private applyDropdownItemEnabledState(entry: HTMLButtonElement, enabled: boolean): void {
    entry.disabled = !enabled;
    entry.style.opacity = enabled ? '1' : '0.4';
    entry.style.cursor = enabled ? 'pointer' : 'default';
    entry.style.color = enabled ? Theme.buttonTextColor : '#666666';
  }

  /** Closes the currently open dropdown menu if any. */
  private closeOpenMenu(): void {
    if (!this.openMenu) return;
    this.openMenu.style.display = 'none';
    this.openMenuButton?.setAttribute('aria-expanded', 'false');
    this.openMenu = null;
    this.openMenuButton = null;
  }

  /**
   * Closes dropdowns when the user clicks outside the toolbar.
   *
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
   *
   * @param labelPrefix Prefix to match.
   * @returns Matching button or undefined.
   */
  private findButtonByLabelPrefix(labelPrefix: string): HTMLButtonElement | undefined {
    return this.buttons.find((entry) => this.buttonMatchesPrefix(entry, labelPrefix));
  }

  /**
   * Returns whether a button's visible label or aria-label starts with the
   * prefix.
   *
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
   *
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
