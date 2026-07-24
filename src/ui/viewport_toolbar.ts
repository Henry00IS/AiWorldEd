import { Theme } from '../theme.js';
import { ShadingMode } from '../types/shading_mode.js';
import { ToolbarIcons } from './toolbar_icons.js';

/**
 * Compact toolbar overlaid at the top of a single viewport.
 * Provides per-viewport shading modes and a Fit action.
 */
export class ViewportToolbar {
  private container: HTMLElement;
  private titleElement: HTMLElement;
  private buttonRow: HTMLElement;
  private shadingButtons: Map<ShadingMode, HTMLButtonElement>;
  private fitButton: HTMLButtonElement;
  private onShadingMode: ((mode: ShadingMode) => void) | null;
  private onFit: (() => void) | null;
  private currentMode: ShadingMode;

  /**
   * Creates a viewport toolbar and appends it to the given parent.
   * @param parentElement The viewport container element.
   * @param titleText The viewport display name shown on the left.
   * @param initialMode The shading mode to highlight initially.
   */
  constructor(
    parentElement: HTMLElement,
    titleText: string,
    initialMode: ShadingMode = ShadingMode.SOLID
  ) {
    this.container = document.createElement('div');
    this.titleElement = document.createElement('span');
    this.buttonRow = document.createElement('div');
    this.shadingButtons = new Map();
    this.onShadingMode = null;
    this.onFit = null;
    this.currentMode = initialMode;
    this.applyContainerStyles();
    this.buildTitle(titleText);
    this.buildControls();
    this.fitButton = this.createFitButton();
    this.buttonRow.appendChild(this.createSeparator());
    this.buttonRow.appendChild(this.fitButton);
    this.container.appendChild(this.titleElement);
    this.container.appendChild(this.buttonRow);
    parentElement.appendChild(this.container);
    this.setActiveShadingMode(initialMode);
  }

  /**
   * Registers the callback invoked when a shading mode button is pressed.
   * @param callback The shading mode change handler.
   */
  setOnShadingMode(callback: (mode: ShadingMode) => void): void {
    this.onShadingMode = callback;
  }

  /**
   * Registers the callback invoked when the Fit button is pressed.
   * @param callback The fit action handler.
   */
  setOnFit(callback: () => void): void {
    this.onFit = callback;
  }

  /**
   * Updates which shading mode button appears selected.
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
   * @returns The active ShadingMode value.
   */
  getActiveShadingMode(): ShadingMode {
    return this.currentMode;
  }

  /**
   * Returns the root toolbar element.
   * @returns The toolbar container element.
   */
  getElement(): HTMLElement {
    return this.container;
  }

  /**
   * Returns the Fit button element for tests and focus management.
   * @returns The Fit toolbar button.
   */
  getFitButton(): HTMLButtonElement {
    return this.fitButton;
  }

  /**
   * Returns the shading mode button for the given mode.
   * @param mode The shading mode whose button is requested.
   * @returns The button element, or undefined if missing.
   */
  getShadingButton(mode: ShadingMode): HTMLButtonElement | undefined {
    return this.shadingButtons.get(mode);
  }

  /**
   * Removes the toolbar from the DOM.
   */
  dispose(): void {
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.shadingButtons.clear();
  }

  /**
   * Builds the viewport title label on the left side of the bar.
   * @param titleText The text to display.
   */
  private buildTitle(titleText: string): void {
    this.titleElement.classList.add('editor-viewport-title');
    this.titleElement.textContent = titleText;
    this.titleElement.style.fontFamily = Theme.uiFontFamily;
    this.titleElement.style.fontSize = '11px';
    this.titleElement.style.fontWeight = '600';
    this.titleElement.style.letterSpacing = '0.04em';
    this.titleElement.style.textTransform = 'uppercase';
    this.titleElement.style.color = Theme.viewportLabelTextColor;
    this.titleElement.style.userSelect = 'none';
    this.titleElement.style.padding = '0 4px';
  }

  /**
   * Creates the shading mode button group.
   */
  private buildControls(): void {
    this.buttonRow.style.display = 'flex';
    this.buttonRow.style.alignItems = 'center';
    this.buttonRow.style.gap = '2px';
    this.buttonRow.style.marginLeft = 'auto';
    this.addShadingButton(ShadingMode.SOLID, 'Solid', ToolbarIcons.solid());
    this.addShadingButton(ShadingMode.WIREFRAME, 'Wireframe', ToolbarIcons.wireframe());
    this.addShadingButton(ShadingMode.FLAT, 'Flat', ToolbarIcons.flat());
  }

  /**
   * Adds one shading mode toggle button.
   * @param mode The shading mode this button activates.
   * @param tooltip Accessible label and tooltip text.
   * @param iconSvg SVG markup for the button face.
   */
  private addShadingButton(
    mode: ShadingMode,
    tooltip: string,
    iconSvg: string
  ): void {
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
   * Creates a compact square icon button.
   * @param tooltip The title/aria label for the button.
   * @param iconSvg SVG icon markup.
   * @returns The styled button element.
   */
  private createIconButton(tooltip: string, iconSvg: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.title = tooltip;
    button.setAttribute('aria-label', tooltip);
    button.innerHTML = iconSvg;
    this.applyButtonBaseStyles(button);
    button.addEventListener('mouseenter', () => {
      if (button.dataset.active !== 'true') {
        button.style.background = Theme.viewportToolbarButtonHover;
      }
    });
    button.addEventListener('mouseleave', () => {
      if (button.dataset.active !== 'true') {
        button.style.background = 'transparent';
      }
    });
    return button;
  }

  /**
   * Applies shared visual styles to an icon button.
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
   * @param button The button to update.
   * @param active Whether the button should appear selected.
   */
  private applyActiveState(button: HTMLButtonElement, active: boolean): void {
    button.dataset.active = active ? 'true' : 'false';
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
   * @returns The separator element.
   */
  private createSeparator(): HTMLElement {
    const separator = document.createElement('div');
    separator.style.width = '1px';
    separator.style.height = '16px';
    separator.style.margin = '0 4px';
    separator.style.background = Theme.viewportToolbarSeparator;
    separator.style.flexShrink = '0';
    return separator;
  }

  /**
   * Applies layout styles for the toolbar strip.
   */
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
    this.container.style.zIndex = '20';
    this.container.style.userSelect = 'none';
    this.container.style.backdropFilter = 'blur(8px)';
  }

  /**
   * Converts a hex color number to an rgba CSS string.
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
