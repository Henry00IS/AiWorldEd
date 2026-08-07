import {
  isMenuAction,
  isMenuSeparator,
  isMenuSubmenu,
  type ToolbarMenuAction,
  type ToolbarMenuEntry,
  type ToolbarMenuSubmenu,
} from './menu_types.js';
import {
  applyMenuItemEnabledState,
  applyMenuItemHoverState,
  styleMenuActionRow,
  styleMenuLabel,
  styleMenuPanel,
  styleMenuSeparator,
  styleMenuShortcut,
  styleMenuSubmenuCaret,
} from './menu_styles.js';
import { FloatingPanelStack } from '@/ui/floating_panel/panel_floating_stack.js';

/** Bound action or submenu row with its live entry definition. */
interface BoundMenuRow {
  entry: ToolbarMenuAction | ToolbarMenuSubmenu;
  button: HTMLButtonElement;
  /** Wrapper used for submenu parents so the flyout is not inside the button. */
  rowHost: HTMLElement;
  shortcutElement: HTMLElement | null;
  submenuPanel: PanelMenu | null;
}

/** Delay before a submenu flyout closes after pointer leave (Windows-like). */
const SUBMENU_CLOSE_DELAY_MS = 200;

/**
 * Menu panel for toolbar dropdowns, nested flyouts, and floating context menus.
 * Root panels mount only while open, register as pointer-block surfaces while
 * open, return toolbar-anchored roots to their home host when closed, and
 * remove ephemeral body-mounted roots from the document when closed.
 */
export class PanelMenu {
  private readonly ownerDocument: Document;
  private readonly root: HTMLElement;
  private readonly rows: BoundMenuRow[];
  private readonly onRequestCloseRoot: () => void;
  private readonly isSubmenu: boolean;
  private openChildPanel: PanelMenu | null;
  private activeRowButton: HTMLButtonElement | null;
  private pendingCloseTimer: ReturnType<typeof setTimeout> | null;
  private homeParent: HTMLElement | null;
  private homeNextSibling: ChildNode | null;
  /** True when this root is body-mounted with no toolbar home host. */
  private isEphemeralBodyMount: boolean;

  /**
   * Creates a menu panel from declarative entries.
   *
   * @param entries Menu rows to render.
   * @param onRequestCloseRoot Closes the entire toolbar dropdown tree.
   * @param isSubmenu Whether this panel is a nested flyout.
   * @param ownerDocument Document that owns the menu DOM (main or detached).
   */
  constructor(
    entries: ToolbarMenuEntry[],
    onRequestCloseRoot: () => void,
    isSubmenu = false,
    ownerDocument: Document = document,
  ) {
    this.rows = [];
    this.isSubmenu = isSubmenu;
    this.ownerDocument = ownerDocument;
    this.openChildPanel = null;
    this.activeRowButton = null;
    this.pendingCloseTimer = null;
    this.homeParent = null;
    this.homeNextSibling = null;
    this.isEphemeralBodyMount = false;
    this.onRequestCloseRoot = onRequestCloseRoot;
    this.root = this.ownerDocument.createElement('div');
    this.root.classList.add(isSubmenu ? 'editor-toolbar-dropdown-submenu' : 'editor-toolbar-dropdown-menu');
    this.root.setAttribute('role', 'menu');
    styleMenuPanel(this.root, isSubmenu);
    entries.forEach((entry) => this.appendEntry(entry));
  }

  /**
   * Returns the panel root element.
   *
   * @returns Menu panel DOM node.
   */
  getElement(): HTMLElement {
    return this.root;
  }

  /**
   * Shows the panel and refreshes live enablement and shortcut labels. When
   * this is a root menu and an anchor is provided, mounts on the anchor
   * document body with fixed positioning and registers as a pointer-block
   * surface.
   *
   * @param anchor Optional trigger control used to place a root menu.
   */
  open(anchor?: HTMLElement): void {
    this.refresh();
    if (!this.isSubmenu && anchor) {
      this.mountRootMenuOnBody(anchor);
    }
    this.root.style.display = 'block';
    this.registerRootPointerBlockSurface();
  }

  /**
   * Opens a root menu as a floating panel at the given screen coordinates.
   * Mounts on the owner document body as an ephemeral shell, shows the panel,
   * clamps it into the viewport, and registers a pointer-block surface. No-ops
   * when this panel is a nested flyout.
   *
   * @param clientX Viewport X in CSS pixels.
   * @param clientY Viewport Y in CSS pixels.
   * @param ownerDocument Document that owns the click (main or detached).
   */
  openAt(clientX: number, clientY: number, ownerDocument: Document = document): void {
    if (this.isSubmenu) {
      return;
    }
    this.refresh();
    this.mountRootMenuAtPoint(clientX, clientY, ownerDocument);
    this.root.style.display = 'block';
    this.clampRootMenuToViewport(ownerDocument);
    this.registerRootPointerBlockSurface();
  }

  /**
   * Hides the panel and any open child flyout. Root shells leave their open
   * mount: toolbar menus return to the home host; ephemeral body menus are
   * removed from the document.
   */
  close(): void {
    this.cancelPendingClose();
    this.closeOpenChild();
    this.setActiveRow(null);
    this.root.style.display = 'none';
    this.unregisterRootPointerBlockSurface();
    this.unmountRootShellAfterClose();
  }

  /**
   * Closes the panel and removes its root from the DOM. Safe to call more than
   * once.
   */
  dispose(): void {
    this.close();
    this.unregisterRootPointerBlockSurface();
    this.root.remove();
    this.homeParent = null;
    this.homeNextSibling = null;
    this.isEphemeralBodyMount = false;
  }

  /** Registers this root menu as a pointer-block surface. No-ops for submenus. */
  private registerRootPointerBlockSurface(): void {
    if (this.isSubmenu) {
      return;
    }
    FloatingPanelStack.registerPointerBlockSurface(this.root);
  }

  /** Unregisters this root menu as a pointer-block surface. No-ops for submenus. */
  private unregisterRootPointerBlockSurface(): void {
    if (this.isSubmenu) {
      return;
    }
    FloatingPanelStack.unregisterPointerBlockSurface(this.root);
  }

  /**
   * After hide, restores a toolbar-anchored root to its home host, or removes
   * an ephemeral body-mounted root from the document entirely.
   */
  private unmountRootShellAfterClose(): void {
    if (this.isSubmenu) {
      return;
    }
    if (this.isEphemeralBodyMount || !this.homeParent) {
      this.root.remove();
      this.isEphemeralBodyMount = false;
      this.homeParent = null;
      this.homeNextSibling = null;
      return;
    }
    this.restoreRootMenuHome();
  }

  /**
   * Re-parents a root menu under the anchor's owner document body and places it
   * below the anchor with fixed positioning. Clears ephemeral body-mount state
   * and records the home host when not already recorded.
   *
   * @param anchor Button or control that opened the menu.
   */
  private mountRootMenuOnBody(anchor: HTMLElement): void {
    this.isEphemeralBodyMount = false;
    this.rememberRootMenuHome();
    const rect = anchor.getBoundingClientRect();
    this.root.style.position = 'fixed';
    this.root.style.top = `${Math.round(rect.bottom + 4)}px`;
    this.root.style.left = `${Math.round(rect.left)}px`;
    const ownerDocument = anchor.ownerDocument;
    ownerDocument.body.appendChild(this.root);
  }

  /**
   * Mounts a root menu on the document body at an absolute viewport point with
   * no home host and marks the shell as an ephemeral body mount.
   *
   * @param clientX Viewport X in CSS pixels.
   * @param clientY Viewport Y in CSS pixels.
   * @param ownerDocument Document that should own the menu DOM.
   */
  private mountRootMenuAtPoint(clientX: number, clientY: number, ownerDocument: Document): void {
    this.homeParent = null;
    this.homeNextSibling = null;
    this.isEphemeralBodyMount = true;
    this.root.style.position = 'fixed';
    this.root.style.top = `${Math.round(clientY)}px`;
    this.root.style.left = `${Math.round(clientX)}px`;
    ownerDocument.body.appendChild(this.root);
  }

  /**
   * Records the original parent and next sibling of the root when not already
   * recorded.
   */
  private rememberRootMenuHome(): void {
    if (this.homeParent) {
      return;
    }
    this.homeParent = this.root.parentElement;
    this.homeNextSibling = this.root.nextSibling;
  }

  /**
   * Keeps a floating root menu fully on-screen after it is laid out.
   *
   * @param ownerDocument Document whose viewport is used for clamping.
   */
  private clampRootMenuToViewport(ownerDocument: Document): void {
    const view = ownerDocument.defaultView;
    if (!view) return;
    const rect = this.root.getBoundingClientRect();
    const margin = 4;
    let left = rect.left;
    let top = rect.top;
    if (left + rect.width > view.innerWidth - margin) {
      left = Math.max(margin, view.innerWidth - rect.width - margin);
    }
    if (top + rect.height > view.innerHeight - margin) {
      top = Math.max(margin, view.innerHeight - rect.height - margin);
    }
    if (left < margin) left = margin;
    if (top < margin) top = margin;
    this.root.style.left = `${Math.round(left)}px`;
    this.root.style.top = `${Math.round(top)}px`;
  }

  /** Returns a root menu to its original parent after close. */
  private restoreRootMenuHome(): void {
    if (this.isSubmenu || !this.homeParent) return;
    if (this.homeNextSibling && this.homeNextSibling.parentNode === this.homeParent) {
      this.homeParent.insertBefore(this.root, this.homeNextSibling);
    } else {
      this.homeParent.appendChild(this.root);
    }
    this.homeParent = null;
    this.homeNextSibling = null;
  }

  /**
   * Returns whether the panel is currently visible.
   *
   * @returns True when display is not none.
   */
  isOpen(): boolean {
    return this.root.style.display !== 'none';
  }

  /** Re-evaluates enablement and shortcut labels for every bound row. */
  refresh(): void {
    this.rows.forEach((row) => this.refreshRow(row));
    this.syncActiveRowHighlight();
  }

  /**
   * Appends one declarative entry to the panel.
   *
   * @param entry Entry to render.
   */
  private appendEntry(entry: ToolbarMenuEntry): void {
    if (isMenuSeparator(entry)) {
      this.root.appendChild(this.createSeparatorElement());
      return;
    }
    if (isMenuSubmenu(entry)) {
      this.root.appendChild(this.createSubmenuRow(entry));
      return;
    }
    if (isMenuAction(entry)) {
      this.root.appendChild(this.createActionRow(entry));
    }
  }

  /**
   * Creates a horizontal separator element.
   *
   * @returns Separator DOM node.
   */
  private createSeparatorElement(): HTMLElement {
    const separator = this.ownerDocument.createElement('div');
    styleMenuSeparator(separator);
    return separator;
  }

  /**
   * Creates a clickable action row with optional shortcut text.
   *
   * @param entry Action definition.
   * @returns Row button element.
   */
  private createActionRow(entry: ToolbarMenuAction): HTMLButtonElement {
    const button = this.createBaseRowButton(entry.label);
    applyMenuItemTooltip(button, entry.tooltip);
    const shortcutElement = this.appendShortcutSlot(button);
    this.bindActionActivation(button, entry);
    this.bindActionRowHover(button);
    this.rows.push({
      entry,
      button,
      rowHost: button,
      shortcutElement,
      submenuPanel: null,
    });
    return button;
  }

  /**
   * Creates a parent row that opens a nested flyout on hover. The flyout is a
   * sibling of the button so opening it cannot steal hover from the parent.
   *
   * @param entry Submenu definition.
   * @returns Wrapper element containing the button and flyout.
   */
  private createSubmenuRow(entry: ToolbarMenuSubmenu): HTMLElement {
    const host = this.ownerDocument.createElement('div');
    host.classList.add('editor-toolbar-dropdown-submenu-host');
    host.style.position = 'relative';
    host.style.width = '100%';
    const button = this.createBaseRowButton(entry.label);
    applyMenuItemTooltip(button, entry.tooltip);
    button.classList.add('editor-toolbar-dropdown-item-has-submenu');
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    this.appendSubmenuCaret(button);
    const submenuPanel = new PanelMenu(entry.children, this.onRequestCloseRoot, true, this.ownerDocument);
    host.appendChild(button);
    host.appendChild(submenuPanel.getElement());
    this.bindSubmenuRowHover(host, button, submenuPanel);
    this.rows.push({
      entry,
      button,
      rowHost: host,
      shortcutElement: null,
      submenuPanel,
    });
    return host;
  }

  /**
   * Creates the shared button chrome for action and submenu rows.
   *
   * @param label Visible left-side label text.
   * @returns Styled button with label span.
   */
  private createBaseRowButton(label: string): HTMLButtonElement {
    const button = this.ownerDocument.createElement('button');
    button.classList.add('editor-toolbar-dropdown-item');
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    styleMenuActionRow(button);
    const labelElement = this.ownerDocument.createElement('span');
    labelElement.classList.add('editor-toolbar-dropdown-label');
    labelElement.textContent = label;
    styleMenuLabel(labelElement);
    button.appendChild(labelElement);
    return button;
  }

  /**
   * Appends an empty shortcut slot that refresh fills later.
   *
   * @param button Parent row button.
   * @returns Shortcut element.
   */
  private appendShortcutSlot(button: HTMLButtonElement): HTMLElement {
    const shortcut = this.ownerDocument.createElement('span');
    styleMenuShortcut(shortcut);
    shortcut.style.display = 'none';
    button.appendChild(shortcut);
    return shortcut;
  }

  /**
   * Appends a disclosure caret for submenu parents.
   *
   * @param button Parent row button.
   */
  private appendSubmenuCaret(button: HTMLButtonElement): void {
    const caret = this.ownerDocument.createElement('span');
    caret.textContent = '▸';
    caret.setAttribute('aria-hidden', 'true');
    styleMenuSubmenuCaret(caret);
    button.appendChild(caret);
  }

  /**
   * Binds click activation for an action row.
   *
   * @param button Row button.
   * @param entry Action definition.
   */
  private bindActionActivation(button: HTMLButtonElement, entry: ToolbarMenuAction): void {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      if (button.disabled) return;
      entry.onClick();
      this.onRequestCloseRoot();
    });
  }

  /**
   * Binds hover highlight for a plain action row.
   *
   * @param button Action row button.
   */
  private bindActionRowHover(button: HTMLButtonElement): void {
    button.addEventListener('mouseenter', () => {
      this.setActiveRow(button);
      this.closeOpenChild();
    });
    button.addEventListener('mouseleave', (event) => {
      if (this.shouldKeepActiveRow(button, event.relatedTarget)) return;
      if (this.activeRowButton === button) this.setActiveRow(null);
    });
  }

  /**
   * Binds hover open/close for a submenu parent and keeps its highlight while
   * the pointer is over the parent or its open flyout.
   *
   * @param host Wrapper that contains the button and flyout.
   * @param button Parent row button.
   * @param submenuPanel Nested flyout panel.
   */
  private bindSubmenuRowHover(host: HTMLElement, button: HTMLButtonElement, submenuPanel: PanelMenu): void {
    const flyout = submenuPanel.getElement();
    const keepOpen = (): void => {
      this.cancelPendingClose();
      this.setActiveRow(button);
      if (!button.disabled) this.openChild(submenuPanel, button);
    };
    host.addEventListener('mouseenter', keepOpen);
    flyout.addEventListener('mouseenter', keepOpen);
    host.addEventListener('mouseleave', (event) => {
      if (this.isPointerStillInSubmenuRow(host, flyout, event.relatedTarget)) return;
      this.scheduleCloseChild(submenuPanel, button);
    });
    flyout.addEventListener('mouseleave', (event) => {
      if (this.isPointerStillInSubmenuRow(host, flyout, event.relatedTarget)) return;
      this.scheduleCloseChild(submenuPanel, button);
    });
  }

  /**
   * Schedules closing a flyout after a short delay so diagonal pointer travel
   * into the flyout does not collapse it immediately.
   *
   * @param submenuPanel Flyout that may close.
   * @param button Parent row button for that flyout.
   */
  private scheduleCloseChild(submenuPanel: PanelMenu, button: HTMLButtonElement): void {
    this.cancelPendingClose();
    this.pendingCloseTimer = setTimeout(() => {
      this.pendingCloseTimer = null;
      if (this.openChildPanel !== submenuPanel) return;
      this.closeOpenChild();
      if (this.activeRowButton === button) this.setActiveRow(null);
    }, SUBMENU_CLOSE_DELAY_MS);
  }

  /** Cancels any pending delayed flyout close. */
  private cancelPendingClose(): void {
    if (this.pendingCloseTimer === null) return;
    clearTimeout(this.pendingCloseTimer);
    this.pendingCloseTimer = null;
  }

  /**
   * Returns whether the pointer is still inside an action row host.
   *
   * @param host Row host currently being left.
   * @param relatedTarget Element the pointer moved toward, if any.
   * @returns True when the active highlight should remain.
   */
  private shouldKeepActiveRow(host: HTMLElement, relatedTarget: EventTarget | null): boolean {
    if (!(relatedTarget instanceof Node)) return false;
    return host.contains(relatedTarget);
  }

  /**
   * Returns whether the pointer is still over a submenu parent or its flyout.
   *
   * @param host Submenu row host.
   * @param flyout Nested flyout panel element.
   * @param relatedTarget Element the pointer moved toward, if any.
   * @returns True when the submenu should stay open.
   */
  private isPointerStillInSubmenuRow(
    host: HTMLElement,
    flyout: HTMLElement,
    relatedTarget: EventTarget | null,
  ): boolean {
    if (!(relatedTarget instanceof Node)) return false;
    return host.contains(relatedTarget) || flyout.contains(relatedTarget);
  }

  /**
   * Opens a child flyout after closing any other open child. Marks the parent
   * active before DOM changes so highlight is never dropped mid-open.
   *
   * @param panel Child panel to open.
   * @param parentButton Parent row that owns the panel.
   */
  private openChild(panel: PanelMenu, parentButton: HTMLButtonElement): void {
    this.cancelPendingClose();
    if (this.openChildPanel === panel) {
      this.setActiveRow(parentButton);
      return;
    }
    this.closeOpenChild();
    this.openChildPanel = panel;
    this.setActiveRow(parentButton);
    parentButton.setAttribute('aria-expanded', 'true');
    panel.open();
  }

  /** Closes the currently open child flyout if any. */
  private closeOpenChild(): void {
    this.cancelPendingClose();
    if (!this.openChildPanel) return;
    const closing = this.openChildPanel;
    this.openChildPanel = null;
    closing.close();
    this.rows.forEach((row) => {
      if (row.submenuPanel) row.button.setAttribute('aria-expanded', 'false');
    });
  }

  /**
   * Sets which row shows the hover/active background. Exactly one row may be
   * active at a time within this panel.
   *
   * @param button Row button to highlight, or null to clear all.
   */
  private setActiveRow(button: HTMLButtonElement | null): void {
    this.activeRowButton = button;
    this.syncActiveRowHighlight();
  }

  /** Applies active/hover background from the current active row pointer. */
  private syncActiveRowHighlight(): void {
    this.rows.forEach((row) => {
      applyMenuItemHoverState(row.button, row.button === this.activeRowButton);
    });
  }

  /**
   * Refreshes enablement and shortcut text for one bound row.
   *
   * @param row Bound row state.
   */
  private refreshRow(row: BoundMenuRow): void {
    const enabled = row.entry.isEnabled ? row.entry.isEnabled() : true;
    applyMenuItemEnabledState(row.button, enabled);
    applyMenuItemTooltip(row.button, row.entry.tooltip);
    if (isMenuAction(row.entry) && row.shortcutElement) {
      this.refreshShortcutLabel(row.shortcutElement, row.entry);
    }
    row.submenuPanel?.refresh();
  }

  /**
   * Resolves and displays the shortcut label for an action row.
   *
   * @param shortcutElement Shortcut span.
   * @param entry Action definition.
   */
  private refreshShortcutLabel(shortcutElement: HTMLElement, entry: ToolbarMenuAction): void {
    const text = this.resolveShortcutText(entry);
    if (!text) {
      shortcutElement.textContent = '';
      shortcutElement.style.display = 'none';
      return;
    }
    shortcutElement.textContent = text;
    shortcutElement.style.display = '';
  }

  /**
   * Resolves the live or static shortcut string for an action.
   *
   * @param entry Action definition.
   * @returns Shortcut text, or empty when none.
   */
  private resolveShortcutText(entry: ToolbarMenuAction): string {
    if (!entry.shortcut) return '';
    if (typeof entry.shortcut === 'function') {
      return entry.shortcut()?.trim() ?? '';
    }
    return entry.shortcut.trim();
  }
}

/**
 * Applies or clears a native title tooltip on a menu row.
 *
 * @param element Menu row button.
 * @param tooltip Static string, live resolver, or undefined.
 */
function applyMenuItemTooltip(
  element: HTMLElement,
  tooltip: string | (() => string | undefined | null) | undefined,
): void {
  const text = resolveMenuTooltipText(tooltip);
  if (!text) {
    element.removeAttribute('title');
    return;
  }
  element.title = text;
}

/**
 * Resolves a menu tooltip definition to display text.
 *
 * @param tooltip Static string, live resolver, or undefined.
 * @returns Trimmed tooltip text, or empty when none.
 */
function resolveMenuTooltipText(tooltip: string | (() => string | undefined | null) | undefined): string {
  if (!tooltip) return '';
  if (typeof tooltip === 'function') {
    return tooltip()?.trim() ?? '';
  }
  return tooltip.trim();
}
