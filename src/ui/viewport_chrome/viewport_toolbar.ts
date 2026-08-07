import { Theme } from '@/theme.js';
import { ShadingMode } from '@/types/shading_mode.js';
import { ToolbarIcons } from '@/ui/toolbar/toolbar_icons.js';
import { PanelMenu } from '@/ui/menu/panel_menu.js';
import { appendMenuDropdownCaret } from '@/ui/menu/menu_dropdown_caret.js';
import { MenuOutsidePointerClose } from '@/ui/menu/menu_outside_pointer_close.js';
import { ViewportKind, getViewportKindDisplayLabel } from '@/viewports/core/viewport_kind.js';
import { buildViewportTypeMenuEntries } from './viewport_type_menu.js';
import { UiStackLayers } from '@/ui/stack/ui_stack_layers.js';

/**
 * Compact toolbar overlaid at the top of a single viewport. Provides
 * per-viewport shading modes, type menu, Fit, and maximize actions.
 */
export class ViewportToolbar {
  private readonly ownerDocument: Document;
  private readonly ownerWindow: Window;
  private container: HTMLElement;
  private titleWrapper: HTMLElement;
  private titleButton: HTMLButtonElement;
  private titleLabel: HTMLElement;
  private typeMenuPanel: PanelMenu | null;
  private readonly outsideCloser: MenuOutsidePointerClose;
  private buttonRow: HTMLElement;
  private contentWireframesButton: HTMLButtonElement;
  private projectedGridButton: HTMLButtonElement;
  private shadingButtons: Map<ShadingMode, HTMLButtonElement>;
  private fitButton: HTMLButtonElement;
  private maximizeButton: HTMLButtonElement;
  private onShadingMode: ((mode: ShadingMode) => void) | null;
  private onContentWireframesToggle: ((visible: boolean) => void) | null;
  private onProjectedGridToggle: ((visible: boolean) => void) | null;
  private onFit: (() => void) | null;
  private onToggleMaximize: (() => void) | null;
  private onViewportKindChange: ((kind: ViewportKind) => void) | null;
  private currentMode: ShadingMode;
  private currentKind: ViewportKind;
  private contentWireframesActive: boolean;
  private projectedGridActive: boolean;

  /**
   * Creates a viewport toolbar and appends it to the given parent.
   *
   * @param parentElement The viewport container element.
   * @param titleText The viewport display name shown on the left.
   * @param initialMode The shading mode to highlight initially.
   */
  constructor(parentElement: HTMLElement, titleText: string, initialMode: ShadingMode = ShadingMode.SOLID) {
    this.ownerDocument = parentElement.ownerDocument;
    this.ownerWindow = parentElement.ownerDocument.defaultView ?? window;
    this.container = this.ownerDocument.createElement('div');
    this.titleWrapper = this.ownerDocument.createElement('div');
    this.titleButton = this.ownerDocument.createElement('button');
    this.titleLabel = this.ownerDocument.createElement('span');
    this.typeMenuPanel = null;
    this.outsideCloser = new MenuOutsidePointerClose();
    this.buttonRow = this.ownerDocument.createElement('div');
    this.shadingButtons = new Map();
    this.onShadingMode = null;
    this.onContentWireframesToggle = null;
    this.onProjectedGridToggle = null;
    this.onFit = null;
    this.onToggleMaximize = null;
    this.onViewportKindChange = null;
    this.currentMode = initialMode;
    this.currentKind = ViewportKind.PERSPECTIVE;
    this.contentWireframesActive = true;
    this.projectedGridActive = true;
    this.applyContainerStyles();
    this.buildTitle(titleText);
    this.contentWireframesButton = this.createToggleButton(
      'Content and brush wireframes',
      ToolbarIcons.contentWireframes(),
      () => this.toggleContentWireframes(),
    );
    this.projectedGridButton = this.createToggleButton('Projected surface grid', ToolbarIcons.projectedGrid(), () =>
      this.toggleProjectedGrid(),
    );
    this.buildControls();
    this.fitButton = this.createFitButton();
    this.maximizeButton = this.createMaximizeButton();
    this.buttonRow.appendChild(this.createSeparator());
    this.buttonRow.appendChild(this.fitButton);
    this.buttonRow.appendChild(this.maximizeButton);
    this.container.appendChild(this.titleWrapper);
    this.container.appendChild(this.buttonRow);
    parentElement.appendChild(this.container);
    this.setActiveShadingMode(initialMode);
    this.setContentWireframesActive(true);
    this.setProjectedGridActive(true);
  }

  /**
   * Registers the callback invoked when a shading mode button is pressed.
   *
   * @param callback The shading mode change handler.
   */
  setOnShadingMode(callback: (mode: ShadingMode) => void): void {
    this.onShadingMode = callback;
  }

  /**
   * Registers the callback invoked when content wireframes are toggled.
   *
   * @param callback Toggle handler receiving the new visibility.
   */
  setOnContentWireframesToggle(callback: (visible: boolean) => void): void {
    this.onContentWireframesToggle = callback;
  }

  /**
   * Registers the callback invoked when the projected grid is toggled.
   *
   * @param callback Toggle handler receiving the new visibility.
   */
  setOnProjectedGridToggle(callback: (visible: boolean) => void): void {
    this.onProjectedGridToggle = callback;
  }

  /**
   * Registers the callback invoked when the Fit button is pressed.
   *
   * @param callback The fit action handler.
   */
  setOnFit(callback: () => void): void {
    this.onFit = callback;
  }

  /**
   * Registers the callback invoked by the maximize/restore button.
   *
   * @param callback Viewport layout toggle handler.
   */
  setOnToggleMaximize(callback: () => void): void {
    this.onToggleMaximize = callback;
  }

  /**
   * Registers the callback invoked when the user picks a viewport type.
   *
   * @param callback Kind change handler.
   */
  setOnViewportKindChange(callback: (kind: ViewportKind) => void): void {
    this.onViewportKindChange = callback;
  }

  /**
   * Updates the type menu selection and title label for a viewport kind.
   *
   * @param kind Active viewport kind.
   */
  setViewportKind(kind: ViewportKind): void {
    this.currentKind = kind;
    this.setTitle(getViewportKindDisplayLabel(kind));
    this.rebuildTypeMenu();
  }

  /**
   * Updates the maximize button label and selected appearance.
   *
   * @param maximized Whether this viewport currently fills the workspace.
   */
  setMaximized(maximized: boolean): void {
    const label = maximized ? 'Restore viewport layout' : 'Maximize viewport';
    this.maximizeButton.title = label;
    this.maximizeButton.setAttribute('aria-label', label);
    this.applyActiveState(this.maximizeButton, maximized);
  }

  /**
   * Updates which shading mode button appears selected.
   *
   * @param mode The mode to mark as active.
   */
  setActiveShadingMode(mode: ShadingMode): void {
    this.currentMode = mode;
    this.shadingButtons.forEach((button, buttonMode) => {
      this.applyActiveState(button, buttonMode === mode);
    });
  }

  /**
   * Returns the currently highlighted shading mode.
   *
   * @returns The active ShadingMode value.
   */
  getActiveShadingMode(): ShadingMode {
    return this.currentMode;
  }

  /**
   * Updates the title text shown on the left side of the toolbar.
   *
   * @param titleText New display title.
   */
  setTitle(titleText: string): void {
    this.titleLabel.textContent = titleText;
  }

  /**
   * Returns the title button used for type menus and tests.
   *
   * @returns Title HTML button element.
   */
  getTitleElement(): HTMLElement {
    return this.titleButton;
  }

  /**
   * Returns the type dropdown menu panel for tests.
   *
   * @returns Menu panel or null before first open rebuild.
   */
  getTypeMenuPanel(): PanelMenu | null {
    return this.typeMenuPanel;
  }

  /**
   * Returns the root toolbar element.
   *
   * @returns The toolbar container element.
   */
  getElement(): HTMLElement {
    return this.container;
  }

  /**
   * Returns the Fit button element for tests and focus management.
   *
   * @returns The Fit toolbar button.
   */
  getFitButton(): HTMLButtonElement {
    return this.fitButton;
  }

  /**
   * Returns the maximize button element for tests and focus management.
   *
   * @returns The maximize toolbar button.
   */
  getMaximizeButton(): HTMLButtonElement {
    return this.maximizeButton;
  }

  /**
   * Returns the shading mode button for the given mode.
   *
   * @param mode The shading mode whose button is requested.
   * @returns The button element, or undefined if missing.
   */
  getShadingButton(mode: ShadingMode): HTMLButtonElement | undefined {
    return this.shadingButtons.get(mode);
  }

  /**
   * Returns the content wireframes toggle button.
   *
   * @returns The toggle button element.
   */
  getContentWireframesButton(): HTMLButtonElement {
    return this.contentWireframesButton;
  }

  /**
   * Returns the projected grid toggle button.
   *
   * @returns The toggle button element.
   */
  getProjectedGridButton(): HTMLButtonElement {
    return this.projectedGridButton;
  }

  /**
   * Updates the active appearance of the content wireframes toggle.
   *
   * @param active Whether wireframes are enabled.
   */
  setContentWireframesActive(active: boolean): void {
    this.contentWireframesActive = active;
    this.applyActiveState(this.contentWireframesButton, active);
  }

  /**
   * Returns whether the content wireframes toggle appears active.
   *
   * @returns True when the button is selected.
   */
  isContentWireframesActive(): boolean {
    return this.contentWireframesActive;
  }

  /**
   * Updates the active appearance of the projected grid toggle.
   *
   * @param active Whether the projected grid is enabled.
   */
  setProjectedGridActive(active: boolean): void {
    this.projectedGridActive = active;
    this.applyActiveState(this.projectedGridButton, active);
  }

  /**
   * Returns whether the projected grid toggle appears active.
   *
   * @returns True when the button is selected.
   */
  isProjectedGridActive(): boolean {
    return this.projectedGridActive;
  }

  /** Removes the toolbar from the DOM and closes the type menu. */
  dispose(): void {
    this.closeTypeMenu();
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.shadingButtons.clear();
  }

  /**
   * Builds the viewport title control with a dropdown caret.
   *
   * @param titleText The text to display.
   */
  private buildTitle(titleText: string): void {
    this.titleWrapper.style.position = 'relative';
    this.titleWrapper.style.display = 'inline-flex';
    this.titleWrapper.style.alignItems = 'center';
    this.titleButton.type = 'button';
    this.titleButton.classList.add('editor-viewport-title');
    this.titleButton.setAttribute('aria-haspopup', 'menu');
    this.titleButton.setAttribute('aria-expanded', 'false');
    this.titleButton.title = 'Change viewport type';
    this.styleTitleButton();
    this.styleTitleLabel(titleText);
    this.titleButton.appendChild(this.titleLabel);
    this.appendDropdownCaret(this.titleButton);
    this.titleButton.addEventListener('click', (event) => {
      event.stopPropagation();
      this.toggleTypeMenu();
    });
    this.titleWrapper.appendChild(this.titleButton);
    this.rebuildTypeMenu();
  }

  /** Applies layout styles to the type menu header button chrome. */
  private styleTitleButton(): void {
    this.titleButton.style.display = 'inline-flex';
    this.titleButton.style.alignItems = 'center';
    this.titleButton.style.gap = '4px';
    this.titleButton.style.margin = '0';
    this.titleButton.style.padding = '0';
    this.titleButton.style.border = '1px solid transparent';
    this.titleButton.style.borderRadius = '4px';
    this.titleButton.style.background = 'transparent';
    this.titleButton.style.cursor = 'pointer';
    this.titleButton.style.font = 'inherit';
    this.titleButton.style.lineHeight = '1';
    this.titleButton.style.color = Theme.viewportLabelTextColor;
    this.titleButton.style.userSelect = 'none';
  }

  /**
   * Restores the compact title label look (pre-type-menu span styling).
   * Horizontal inset matches the original label padding so titles sit slightly
   * in from the toolbar edge without the oversized type-menu button padding.
   *
   * @param titleText Viewport display name.
   */
  private styleTitleLabel(titleText: string): void {
    this.titleLabel.textContent = titleText;
    this.titleLabel.style.fontFamily = Theme.uiFontFamily;
    this.titleLabel.style.fontSize = '11px';
    this.titleLabel.style.fontWeight = '600';
    this.titleLabel.style.letterSpacing = '0.04em';
    this.titleLabel.style.textTransform = 'uppercase';
    this.titleLabel.style.color = Theme.viewportLabelTextColor;
    this.titleLabel.style.lineHeight = '1';
    this.titleLabel.style.userSelect = 'none';
    this.titleLabel.style.padding = '0 4px 0 3px';
    this.titleLabel.style.margin = '0';
  }

  /**
   * Appends a subtle dropdown caret matching the main toolbar menus.
   *
   * @param button Header button receiving the caret.
   */
  private appendDropdownCaret(button: HTMLButtonElement): void {
    appendMenuDropdownCaret(button, this.ownerDocument, '2px');
  }

  /** Rebuilds the type menu panel from the current kind. */
  private rebuildTypeMenu(): void {
    if (this.typeMenuPanel) {
      this.typeMenuPanel.getElement().remove();
      this.typeMenuPanel = null;
    }
    const entries = buildViewportTypeMenuEntries(this.currentKind, (kind) => {
      this.closeTypeMenu();
      this.onViewportKindChange?.(kind);
    });
    this.typeMenuPanel = new PanelMenu(entries, () => this.closeTypeMenu());
    this.titleWrapper.appendChild(this.typeMenuPanel.getElement());
  }

  /** Opens or closes the type menu panel. */
  private toggleTypeMenu(): void {
    if (!this.typeMenuPanel) return;
    if (this.typeMenuPanel.isOpen()) {
      this.closeTypeMenu();
      return;
    }
    this.openTypeMenu();
  }

  /** Shows the type menu and listens for outside pointer presses. */
  private openTypeMenu(): void {
    if (!this.typeMenuPanel) return;
    this.rebuildTypeMenu();
    this.typeMenuPanel.open(this.titleButton);
    this.titleButton.setAttribute('aria-expanded', 'true');
    this.outsideCloser.begin(
      this.ownerWindow,
      (target) =>
        MenuOutsidePointerClose.isTargetInsideSurfaces([this.titleWrapper, this.typeMenuPanel?.getElement()], target),
      () => this.closeTypeMenu(),
    );
  }

  /** Hides the type menu and removes the outside-click listener. */
  private closeTypeMenu(): void {
    this.typeMenuPanel?.close();
    this.titleButton.setAttribute('aria-expanded', 'false');
    this.outsideCloser.end();
  }

  /** Creates the overlay toggles, separator, and shading mode button group. */
  private buildControls(): void {
    this.buttonRow.style.display = 'flex';
    this.buttonRow.style.alignItems = 'center';
    this.buttonRow.style.gap = '2px';
    this.buttonRow.style.marginLeft = 'auto';
    this.buttonRow.appendChild(this.contentWireframesButton);
    this.buttonRow.appendChild(this.projectedGridButton);
    this.buttonRow.appendChild(this.createSeparator());
    this.addShadingButton(ShadingMode.SOLID, 'Solid', ToolbarIcons.solid());
    this.addShadingButton(ShadingMode.WIREFRAME, 'Wireframe', ToolbarIcons.wireframe());
    this.addShadingButton(ShadingMode.FLAT, 'Flat', ToolbarIcons.flat());
  }

  /**
   * Creates a compact toggle icon button.
   *
   * @param tooltip Title and aria label.
   * @param iconSvg SVG markup for the button face.
   * @param onClick Click handler.
   * @returns The styled button element.
   */
  private createToggleButton(tooltip: string, iconSvg: string, onClick: () => void): HTMLButtonElement {
    const button = this.createIconButton(tooltip, iconSvg);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      onClick();
    });
    return button;
  }

  /** Toggles content wireframes and notifies the registered handler. */
  private toggleContentWireframes(): void {
    const next = !this.contentWireframesActive;
    this.setContentWireframesActive(next);
    this.onContentWireframesToggle?.(next);
  }

  /** Toggles the projected grid and notifies the registered handler. */
  private toggleProjectedGrid(): void {
    const next = !this.projectedGridActive;
    this.setProjectedGridActive(next);
    this.onProjectedGridToggle?.(next);
  }

  /**
   * Adds one shading mode toggle button.
   *
   * @param mode The shading mode this button activates.
   * @param tooltip Accessible label and tooltip text.
   * @param iconSvg SVG markup for the button face.
   */
  private addShadingButton(mode: ShadingMode, tooltip: string, iconSvg: string): void {
    const button = this.createIconButton(tooltip, iconSvg);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      this.setActiveShadingMode(mode);
      if (this.onShadingMode) this.onShadingMode(mode);
    });
    this.shadingButtons.set(mode, button);
    this.buttonRow.appendChild(button);
  }

  /**
   * Creates the Fit action button.
   *
   * @returns The configured Fit button.
   */
  private createFitButton(): HTMLButtonElement {
    const button = this.createIconButton('Fit to selection (F)', ToolbarIcons.fit());
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      if (this.onFit) this.onFit();
    });
    return button;
  }

  /**
   * Creates the maximize/restore action button.
   *
   * @returns The configured maximize button.
   */
  private createMaximizeButton(): HTMLButtonElement {
    const button = this.createIconButton('Maximize viewport', ToolbarIcons.maximize());
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      this.onToggleMaximize?.();
    });
    return button;
  }

  /**
   * Creates a compact square icon button.
   *
   * @param tooltip The title/aria label for the button.
   * @param iconSvg SVG icon markup.
   * @returns The styled button element.
   */
  private createIconButton(tooltip: string, iconSvg: string): HTMLButtonElement {
    const button = this.ownerDocument.createElement('button');
    button.type = 'button';
    button.title = tooltip;
    button.setAttribute('aria-label', tooltip);
    button.innerHTML = iconSvg;
    this.applyButtonBaseStyles(button);
    button.addEventListener('mouseenter', () => {
      if (button.dataset['active'] !== 'true') {
        button.style.background = Theme.viewportToolbarButtonHover;
      }
    });
    button.addEventListener('mouseleave', () => {
      if (button.dataset['active'] !== 'true') {
        button.style.background = 'transparent';
      }
    });
    return button;
  }

  /**
   * Applies shared visual styles to an icon button.
   *
   * @param button The button to style.
   */
  private applyButtonBaseStyles(button: HTMLButtonElement): void {
    button.style.display = 'inline-flex';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';
    button.style.width = '24px';
    button.style.height = '24px';
    button.style.padding = '0';
    button.style.border = '1px solid transparent';
    button.style.borderRadius = '4px';
    button.style.background = 'transparent';
    button.style.color = Theme.buttonTextColor;
    button.style.cursor = 'pointer';
    button.style.lineHeight = '0';
  }

  /**
   * Toggles the active visual state of a shading button.
   *
   * @param button The button to update.
   * @param active Whether the button should appear selected.
   */
  private applyActiveState(button: HTMLButtonElement, active: boolean): void {
    button.dataset['active'] = active ? 'true' : 'false';
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    if (active) {
      button.style.background = this.hexToRgba(Theme.selectionColor, 0.28);
      button.style.borderColor = this.hexToRgba(Theme.selectionColor, 0.85);
      button.style.color = '#ffffff';
    } else {
      button.style.background = 'transparent';
      button.style.borderColor = 'transparent';
      button.style.color = Theme.buttonTextColor;
    }
  }

  /**
   * Creates a thin vertical separator between control groups.
   *
   * @returns The separator element.
   */
  private createSeparator(): HTMLElement {
    const separator = this.ownerDocument.createElement('div');
    separator.style.width = '1px';
    separator.style.height = '16px';
    separator.style.margin = '0 4px';
    separator.style.background = Theme.viewportToolbarSeparator;
    separator.style.flexShrink = '0';
    return separator;
  }

  /** Applies layout styles for the toolbar strip. */
  private applyContainerStyles(): void {
    this.container.classList.add('editor-viewport-toolbar');
    this.container.style.position = 'absolute';
    this.container.style.top = '0';
    this.container.style.left = '0';
    this.container.style.right = '0';
    this.container.style.height = `${Theme.viewportToolbarHeightPx}px`;
    this.container.style.display = 'flex';
    this.container.style.alignItems = 'center';
    this.container.style.gap = '8px';
    this.container.style.padding = '0 8px';
    this.container.style.boxSizing = 'border-box';
    this.container.style.background = Theme.viewportToolbarBackground;
    this.container.style.borderBottom = `1px solid ${Theme.viewportToolbarBorder}`;
    this.container.style.zIndex = String(UiStackLayers.viewportChrome);
    this.container.style.userSelect = 'none';
    this.container.style.backdropFilter = 'blur(8px)';
  }

  /**
   * Converts a hex color number to an rgba CSS string.
   *
   * @param hex The hex color value.
   * @param alpha Optional alpha channel from 0 to 1.
   * @returns An rgba CSS color string.
   */
  private hexToRgba(hex: number, alpha: number = 1): string {
    const r = (hex >> 16) & 255;
    const g = (hex >> 8) & 255;
    const b = hex & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
}
