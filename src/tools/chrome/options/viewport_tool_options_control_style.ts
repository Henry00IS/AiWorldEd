import { Theme } from '@/theme.js';
import { hexToRgb } from '@/utils/utils_color.js';

/**
 * Applies fixed control height, border radius, font metrics, pointer cursor,
 * and non-growing flex sizing to the element.
 *
 * @param element Element whose inline styles receive the control-box
 *   appearance.
 */
export function applyViewportToolOptionsControlBox(element: HTMLElement): void {
  const heightPx = Theme.viewportToolOptionsControlHeightPx;
  element.style.boxSizing = 'border-box';
  element.style.height = `${heightPx}px`;
  element.style.minHeight = `${heightPx}px`;
  element.style.maxHeight = `${heightPx}px`;
  element.style.borderRadius = '4px';
  element.style.fontFamily = Theme.uiFontFamily;
  element.style.fontSize = '11px';
  element.style.lineHeight = '1';
  element.style.cursor = 'pointer';
  element.style.flex = '0 0 auto';
}

/**
 * Applies square icon-button width, zero padding and margin, centered flex
 * layout, and button text color to the button.
 *
 * @param button Button element that receives the icon-button styles.
 */
export function applyViewportToolOptionsIconButtonMetrics(button: HTMLButtonElement): void {
  const sizePx = Theme.viewportToolOptionsControlHeightPx;
  applyViewportToolOptionsControlBox(button);
  button.style.width = `${sizePx}px`;
  button.style.minWidth = `${sizePx}px`;
  button.style.padding = '0';
  button.style.margin = '0';
  button.style.display = 'inline-flex';
  button.style.alignItems = 'center';
  button.style.justifyContent = 'center';
  button.style.color = Theme.buttonTextColor;
}

/**
 * Applies compact text-button padding, border, background, color, weight, and
 * nowrap flex layout to the button.
 *
 * @param button Button element that receives the text-button styles.
 */
export function applyViewportToolOptionsTextButtonMetrics(button: HTMLButtonElement): void {
  applyViewportToolOptionsControlBox(button);
  button.style.display = 'inline-flex';
  button.style.alignItems = 'center';
  button.style.justifyContent = 'center';
  button.style.padding = '0 6px';
  button.style.margin = '0';
  button.style.border = `1px solid ${Theme.inputBorderColor}`;
  button.style.background = hexToRgb(Theme.buttonBackground);
  button.style.color = Theme.buttonTextColor;
  button.style.fontWeight = '500';
  button.style.whiteSpace = 'nowrap';
}
