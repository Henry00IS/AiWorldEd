import { Theme } from '../theme.js';

/**
 * Corner label overlay for a viewport (Top, Front, Side, Perspective).
 */
export class ViewportLabel {
  private labelElement: HTMLElement;

  /**
   * Creates a non-interactive viewport label inside the parent element.
   * @param parentElement Viewport container that receives the label.
   * @param labelText Text shown in the corner badge.
   */
  constructor(parentElement: HTMLElement, labelText: string) {
    this.labelElement = document.createElement('div');
    this.applyStyles();
    this.labelElement.textContent = labelText;
    parentElement.appendChild(this.labelElement);
  }

  /**
   * Applies absolute positioning and theme colors to the label element.
   */
  private applyStyles(): void {
    this.labelElement.style.position = 'absolute';
    this.labelElement.style.top = '8px';
    this.labelElement.style.left = '8px';
    this.labelElement.style.padding = '4px 8px';
    this.labelElement.style.fontSize = '12px';
    this.labelElement.style.fontFamily = 'monospace';
    this.labelElement.style.fontWeight = 'bold';
    this.labelElement.style.color = Theme.viewportLabelTextColor;
    this.labelElement.style.background = Theme.viewportLabelBackgroundColor;
    this.labelElement.style.borderRadius = '4px';
    this.labelElement.style.pointerEvents = 'none';
    this.labelElement.style.userSelect = 'none';
    this.labelElement.style.zIndex = '10';
  }

  /**
   * Returns the root label DOM element.
   * @returns The label HTML element.
   */
  getLabelElement(): HTMLElement {
    return this.labelElement;
  }
}
