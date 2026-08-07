import { Theme } from '@/theme.js';
import { hexToRgb } from '@/utils/utils_color.js';
import { PanelFloating } from '@/ui/floating_panel/panel_floating.js';
import { applyFloatingPanelToolChrome } from '@/ui/floating_panel/panel_floating_tool_chrome.js';
import { SolidModel } from '@/solid/model/solid_model.js';

/** Callbacks for the slim solid model tools panel. */
export interface SolidModelPanelHandlers {
  onAddBoxBrush: () => void;
}

/**
 * Floating solid-model tools panel (add brush). Brush properties live in the
 * inspector. Windowing comes from {@link PanelFloating}.
 */
export class SolidModelPanel extends PanelFloating {
  private handlers: SolidModelPanelHandlers;
  private model: SolidModel | null;
  private statusLabel: HTMLElement;
  private titleLabel: HTMLElement;

  /**
   * Creates a solid model tools panel.
   *
   * @param host Parent element (editor root).
   * @param handlers Tool action callbacks.
   * @param defaultAnchor Element used for default open position.
   */
  constructor(host: HTMLElement, handlers: SolidModelPanelHandlers, defaultAnchor: HTMLElement | null = null) {
    super(host, { corner: 'top-left', insetBelowViewportToolbar: true }, defaultAnchor);
    this.handlers = handlers;
    this.model = null;
    this.statusLabel = document.createElement('div');
    this.titleLabel = document.createElement('span');
    this.populateRoot();
  }

  /**
   * Binds the panel to a solid model for status display.
   *
   * @param model Solid model or null.
   */
  setModel(model: SolidModel | null): void {
    this.model = model;
    this.refresh();
  }

  /**
   * Returns the bound solid model.
   *
   * @returns Current model or null.
   */
  getModel(): SolidModel | null {
    return this.model;
  }

  /** Updates title and status from the bound model. */
  refresh(): void {
    if (!this.model) {
      this.titleLabel.textContent = 'Solid Model';
      this.statusLabel.textContent = 'Select a solid model or brush';
      return;
    }
    this.titleLabel.textContent = this.model.root.name;
    const count = this.model.getBrushCount();
    this.statusLabel.textContent = `${count} brush${count === 1 ? '' : 'es'} — edit ops in Inspector`;
  }

  /** Fills the shared floating-panel shell with solid-model chrome. */
  private populateRoot(): void {
    this.styleRoot(this.root);
    this.root.appendChild(this.buildTitleBar());
    this.root.appendChild(this.buildToolbar());
    this.root.appendChild(this.buildStatus());
  }

  /**
   * Applies chrome styles to the floating panel.
   *
   * @param root Panel root.
   */
  private styleRoot(root: HTMLElement): void {
    applyFloatingPanelToolChrome(root, {
      width: '240px',
      borderRadiusPx: 8,
      boxShadow: '0 10px 28px rgba(0,0,0,0.55)',
    });
  }

  /**
   * Builds the draggable title bar.
   *
   * @returns Title bar element.
   */
  private buildTitleBar(): HTMLElement {
    const parts = this.createStandardTitleBar({
      titleText: 'Solid Model',
      titleElement: this.titleLabel,
    });
    return parts.bar;
  }

  /**
   * Builds the add-brush toolbar row.
   *
   * @returns Toolbar element.
   */
  private buildToolbar(): HTMLElement {
    const bar = document.createElement('div');
    bar.style.display = 'flex';
    bar.style.gap = '6px';
    bar.style.padding = '8px 10px';
    bar.style.borderBottom = `1px solid ${hexToRgb(Theme.separatorColor)}`;
    const addBox = document.createElement('button');
    addBox.type = 'button';
    addBox.textContent = '+ Box Brush';
    this.styleButton(addBox);
    addBox.addEventListener('click', () => this.handlers.onAddBoxBrush());
    bar.appendChild(addBox);
    return bar;
  }

  /**
   * Builds the status line.
   *
   * @returns Status element.
   */
  private buildStatus(): HTMLElement {
    this.statusLabel.style.padding = '6px 10px 10px';
    this.statusLabel.style.color = Theme.statusBarTextColor;
    this.statusLabel.style.fontSize = '11px';
    this.statusLabel.textContent = 'Select a solid model or brush';
    return this.statusLabel;
  }

  /**
   * Styles a compact panel button.
   *
   * @param button Button element.
   */
  private styleButton(button: HTMLButtonElement): void {
    button.style.background = hexToRgb(Theme.buttonBackground);
    button.style.color = Theme.buttonTextColor;
    button.style.border = `1px solid ${hexToRgb(Theme.separatorColor)}`;
    button.style.borderRadius = '4px';
    button.style.padding = '4px 10px';
    button.style.fontSize = '11px';
    button.style.cursor = 'pointer';
    button.style.fontFamily = Theme.uiFontFamily;
  }
}
