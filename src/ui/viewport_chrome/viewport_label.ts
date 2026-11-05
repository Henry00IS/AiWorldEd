import { getActiveUiThemePalette } from '@/ui/theme/theme_ui_palette.js';

/** Corner label overlay for a viewport (Top, Front, Side, Perspective). */
export class ViewportLabel {
  private labelElement: HTMLElement;

  /**
   * Creates a non-interactive viewport label inside the parent element.
   *
   * @param parentElement Viewport container that receives the label.
   * @param labelText Text shown in the corner badge.
   */
  constructor(parentElement: HTMLElement, labelText: string) {
    this.labelElement = document.createElement('div');
    this.applyStyles();
    this.labelElement.textContent = labelText;
    parentElement.appendChild(this.labelElement);
  }

  /** Applies absolute positioning and theme colors to the label element. */
  private applyStyles(): void {
    const palette = getActiveUiThemePalette();
    this.labelElement.classList.add('editor-viewport-label');
    this.labelElement.style.position = 'absolute';
    this.labelElement.style.top = '8px';
    this.labelElement.style.left = '8px';
    this.labelElement.style.padding = '4px 8px';
    this.labelElement.style.fontSize = '12px';
    this.labelElement.style.fontFamily = 'monospace';
    this.labelElement.style.fontWeight = 'bold';
    this.labelElement.style.color = palette.viewportLabelTextColor;
    this.labelElement.style.background = palette.viewportLabelBackground;
    this.labelElement.style.border = `1px solid ${palette.viewportLabelBorderColor}`;
    this.labelElement.style.borderRadius = '4px';
    this.labelElement.style.pointerEvents = 'none';
    this.labelElement.style.userSelect = 'none';
    this.labelElement.style.zIndex = '10';
  }

  /**
   * Returns the root label DOM element.
   *
   * @returns The label HTML element.
   */
  getLabelElement(): HTMLElement {
    return this.labelElement;
  }
}
