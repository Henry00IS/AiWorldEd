import { Theme } from '../theme.js';
import { hexToRgb } from '../utils/color_utils.js';
import { FloatingPanelStack } from './floating_panel_stack.js';
import { SolidModel } from '../solid/model/solid_model.js';

/**
 * Callbacks for the slim solid model tools panel.
 */
export interface SolidModelPanelHandlers {
  onAddBoxBrush: () => void;
}

/**
 * Floating panel for solid-model tools (add brush). Brush properties live in the inspector.
 */
export class SolidModelPanel {
  private root: HTMLElement;
  private host: HTMLElement;
  private handlers: SolidModelPanelHandlers;
  private defaultAnchor: HTMLElement | null;
  private isVisible: boolean;
  private model: SolidModel | null;
  private statusLabel: HTMLElement;
  private titleLabel: HTMLElement;
  private dragOffsetX: number;
  private dragOffsetY: number;
  private isDragging: boolean;

  /**
   * Creates a solid model tools panel.
   * @param host Parent element (editor root).
   * @param handlers Tool action callbacks.
   * @param defaultAnchor Element used for default open position.
   */
  constructor(
    host: HTMLElement,
    handlers: SolidModelPanelHandlers,
    defaultAnchor: HTMLElement | null = null
  ) {
    this.host = host;
    this.handlers = handlers;
    this.defaultAnchor = defaultAnchor;
    this.isVisible = false;
    this.model = null;
    this.isDragging = false;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;
    this.statusLabel = document.createElement('div');
    this.titleLabel = document.createElement('span');
    this.root = this.buildRoot();
    this.host.appendChild(this.root);
  }

  /**
   * Sets the default anchor for panel placement.
   * @param anchor Anchor element or null.
   */
  setDefaultAnchor(anchor: HTMLElement | null): void {
    this.defaultAnchor = anchor;
  }

  /**
   * Binds the panel to a solid model for status display.
   * @param model Solid model or null.
   */
  setModel(model: SolidModel | null): void {
    this.model = model;
    this.refresh();
  }

  /**
   * Returns the bound solid model.
   * @returns Current model or null.
   */
  getModel(): SolidModel | null {
    return this.model;
  }

  /**
   * Updates title and status from the bound model.
   */
  refresh(): void {
    if (!this.model) {
      this.titleLabel.textContent = 'Solid Model';
      this.statusLabel.textContent = 'Select a solid model or brush';
      return;
    }
    this.titleLabel.textContent = this.model.root.name;
    const count = this.model.getBrushCount();
    this.statusLabel.textContent =
      `${count} brush${count === 1 ? '' : 'es'} — edit ops in Inspector`;
  }

  /**
   * Shows the panel.
   */
  show(): void {
    if (this.isVisible) {
      FloatingPanelStack.bringToFront(this.root);
      return;
    }
    this.isVisible = true;
    this.root.style.display = 'flex';
    this.positionDefault();
    FloatingPanelStack.bringToFront(this.root);
  }

  /**
   * Hides the panel.
   */
  hide(): void {
    if (!this.isVisible) return;
    this.isVisible = false;
    this.root.style.display = 'none';
  }

  /**
   * Toggles panel visibility.
   */
  toggle(): void {
    if (this.isVisible) {
      this.hide();
      return;
    }
    this.show();
  }

  /**
   * Returns whether the panel is open.
   * @returns True when visible.
   */
  isOpen(): boolean {
    return this.isVisible;
  }

  /**
   * Removes the panel from the DOM.
   */
  dispose(): void {
    this.hide();
    this.root.remove();
  }

  /**
   * Builds the root panel element.
   * @returns Styled root.
   */
  private buildRoot(): HTMLElement {
    const root = document.createElement('div');
    this.styleRoot(root);
    root.appendChild(this.buildTitleBar());
    root.appendChild(this.buildToolbar());
    root.appendChild(this.buildStatus());
    return root;
  }

  /**
   * Applies chrome styles to the floating panel.
   * @param root Panel root.
   */
  private styleRoot(root: HTMLElement): void {
    root.style.position = 'fixed';
    root.style.display = 'none';
    root.style.flexDirection = 'column';
    root.style.width = '240px';
    root.style.background = hexToRgb(Theme.propertiesPanelBackground);
    root.style.border = `1px solid ${hexToRgb(Theme.separatorColor)}`;
    root.style.borderRadius = '8px';
    root.style.boxShadow = '0 10px 28px rgba(0,0,0,0.55)';
    root.style.fontFamily = Theme.uiFontFamily;
    root.style.userSelect = 'none';
    root.addEventListener('pointerdown', () => {
      FloatingPanelStack.bringToFront(root);
    });
  }

  /**
   * Builds the draggable title bar.
   * @returns Title bar element.
   */
  private buildTitleBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.style.display = 'flex';
    bar.style.alignItems = 'center';
    bar.style.gap = '6px';
    bar.style.padding = '8px 10px';
    bar.style.cursor = 'move';
    bar.style.borderBottom = `1px solid ${hexToRgb(Theme.separatorColor)}`;
    this.titleLabel.textContent = 'Solid Model';
    this.titleLabel.style.flex = '1';
    this.titleLabel.style.color = Theme.buttonTextColor;
    this.titleLabel.style.fontSize = '12px';
    this.titleLabel.style.fontWeight = '600';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '×';
    close.title = 'Close';
    this.styleButton(close);
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      this.hide();
    });
    bar.appendChild(this.titleLabel);
    bar.appendChild(close);
    this.bindDrag(bar);
    return bar;
  }

  /**
   * Builds the add-brush toolbar row.
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

  /**
   * Positions the panel near the default anchor.
   */
  private positionDefault(): void {
    const anchor = this.defaultAnchor ?? this.host;
    const rect = anchor.getBoundingClientRect();
    this.root.style.left = `${Math.max(8, rect.left + 16)}px`;
    this.root.style.top = `${Math.max(8, rect.top + 48)}px`;
  }

  /**
   * Binds title-bar dragging.
   * @param bar Title bar element.
   */
  private bindDrag(bar: HTMLElement): void {
    bar.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement;
      if (target.tagName === 'BUTTON') return;
      this.isDragging = true;
      const rect = this.root.getBoundingClientRect();
      this.dragOffsetX = event.clientX - rect.left;
      this.dragOffsetY = event.clientY - rect.top;
      bar.setPointerCapture(event.pointerId);
    });
    bar.addEventListener('pointermove', (event) => {
      if (!this.isDragging) return;
      this.root.style.left = `${event.clientX - this.dragOffsetX}px`;
      this.root.style.top = `${event.clientY - this.dragOffsetY}px`;
    });
    bar.addEventListener('pointerup', (event) => {
      if (!this.isDragging) return;
      this.isDragging = false;
      try {
        bar.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    });
  }
}
