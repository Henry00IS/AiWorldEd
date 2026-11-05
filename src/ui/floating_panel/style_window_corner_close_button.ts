import { Theme } from '@/theme.js';
import { getActiveUiThemePalette } from '@/ui/theme/theme_ui_palette.js';

/**
 * Shared height for floating-window title bars. The corner close button is one
 * pixel shorter so its hover fill stops above the bar's bottom border.
 */
export const WINDOW_TITLE_BAR_HEIGHT_PX = 32;

/** Square Windows 11-style corner close button size (one pixel under the bar). */
export const WINDOW_CLOSE_BUTTON_SIZE_PX = 31;

/** Class used for CSS :hover close styling (no JS sticky hover). */
export const WINDOW_CLOSE_BUTTON_CLASS = 'aiworlded-window-close';

/** Marks the flex-centered close glyph (SVG). */
const CLOSE_GLYPH_ATTRIBUTE = 'data-aiworlded-close-glyph';

/** Marks that the shared close-button stylesheet is already in the document. */
const CLOSE_STYLE_ATTRIBUTE = 'data-aiworlded-close-style';

/**
 * Creates a Windows 11-style corner close button. It sits flush in the
 * top-right corner of its window, spans a square one pixel shorter than the
 * title bar so it does not paint over the bar's bottom border, shows a bare
 * centered X with no border, turns solid red instantly on hover, and fades
 * back to transparent when the pointer leaves. Hover is CSS-only so a window
 * never opens already painted red.
 *
 * @param ownerDocument Document that owns the created button.
 * @param onClose Callback invoked when the button is activated.
 * @returns Configured close button element.
 */
export function createWindowCornerCloseButton(ownerDocument: Document, onClose: () => void): HTMLButtonElement {
  const closeButton = ownerDocument.createElement('button');
  closeButton.type = 'button';
  closeButton.title = 'Close';
  closeButton.setAttribute('aria-label', 'Close');
  styleWindowCornerCloseButton(closeButton);
  closeButton.addEventListener('click', (event) => {
    event.stopPropagation();
    onClose();
  });
  return closeButton;
}

/**
 * Applies the corner close button chrome to an existing button.
 *
 * @param closeButton Button to style.
 */
export function styleWindowCornerCloseButton(closeButton: HTMLButtonElement): void {
  ensureWindowCornerCloseStyles(closeButton.ownerDocument);
  applyWindowCornerCloseButtonLayout(closeButton);
  applyWindowCornerCloseButtonChrome(closeButton);
  ensureWindowCornerCloseGlyph(closeButton);
}

/**
 * Positions the close button as a square flush with the top-right of its title
 * bar.
 *
 * @param closeButton Button to position.
 */
function applyWindowCornerCloseButtonLayout(closeButton: HTMLButtonElement): void {
  const sizePx = `${WINDOW_CLOSE_BUTTON_SIZE_PX}px`;
  closeButton.style.position = 'absolute';
  closeButton.style.top = '0';
  closeButton.style.right = '0';
  closeButton.style.width = sizePx;
  closeButton.style.height = sizePx;
  closeButton.style.margin = '0';
  closeButton.style.padding = '0';
  closeButton.style.boxSizing = 'border-box';
}

/**
 * Applies non-layout chrome (colors, typography, transition) to a close button.
 *
 * @param closeButton Button to paint.
 */
function applyWindowCornerCloseButtonChrome(closeButton: HTMLButtonElement): void {
  const palette = getActiveUiThemePalette();
  closeButton.classList.add(WINDOW_CLOSE_BUTTON_CLASS);
  closeButton.style.setProperty('--aiworlded-close-hover', palette.windowCloseButtonHoverBackground);
  closeButton.style.border = 'none';
  closeButton.style.borderRadius = '0';
  // Do not set inline background: it overrides CSS :hover and keeps the button
  // stuck transparent. Default and hover colors live in the stylesheet only.
  closeButton.style.removeProperty('background');
  closeButton.style.removeProperty('background-color');
  closeButton.style.color = palette.windowCloseButtonGlyphColor;
  closeButton.style.cursor = 'pointer';
  closeButton.style.display = 'inline-flex';
  closeButton.style.alignItems = 'center';
  closeButton.style.justifyContent = 'center';
  closeButton.style.fontSize = '16px';
  closeButton.style.lineHeight = '1';
  closeButton.style.fontFamily = Theme.uiFontFamily;
  closeButton.style.zIndex = '1';
}

/**
 * Ensures the shared close-button :hover stylesheet exists once per document.
 *
 * @param ownerDocument Document that should own the style element.
 */
function ensureWindowCornerCloseStyles(ownerDocument: Document): void {
  if (ownerDocument.head.querySelector(`style[${CLOSE_STYLE_ATTRIBUTE}="1"]`) !== null) return;
  const style = ownerDocument.createElement('style');
  style.setAttribute(CLOSE_STYLE_ATTRIBUTE, '1');
  style.textContent = `
.${WINDOW_CLOSE_BUTTON_CLASS} {
  background-color: transparent;
  transition: background-color 120ms ease;
}
.${WINDOW_CLOSE_BUTTON_CLASS}:hover {
  background-color: var(--aiworlded-close-hover, #c42b1c);
  transition: background-color 120ms ease;
}
`;
  ownerDocument.head.appendChild(style);
}

/**
 * Ensures the close glyph is a flex-centered SVG X (true geometric center, no
 * translate hack).
 *
 * @param closeButton Button that should show the glyph.
 */
function ensureWindowCornerCloseGlyph(closeButton: HTMLButtonElement): void {
  let glyph = closeButton.querySelector(`[${CLOSE_GLYPH_ATTRIBUTE}="1"]`) as SVGElement | null;
  if (!glyph) {
    closeButton.textContent = '';
    glyph = windowCornerCloseGlyphSvg(closeButton.ownerDocument);
    closeButton.appendChild(glyph);
  }
  glyph.style.display = 'block';
  glyph.style.flex = '0 0 auto';
}

/**
 * Builds the SVG X used as the close glyph.
 *
 * @param ownerDocument Document that owns the SVG.
 * @returns SVG element.
 */
function windowCornerCloseGlyphSvg(ownerDocument: Document): SVGElement {
  const glyph = ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
  glyph.setAttribute(CLOSE_GLYPH_ATTRIBUTE, '1');
  glyph.setAttribute('width', '10');
  glyph.setAttribute('height', '10');
  glyph.setAttribute('viewBox', '0 0 10 10');
  glyph.setAttribute('aria-hidden', 'true');
  glyph.appendChild(windowCornerCloseGlyphPath(ownerDocument));
  return glyph;
}

/**
 * Builds the stroked X path inside the close SVG.
 *
 * @param ownerDocument Document that owns the path.
 * @returns Path element.
 */
function windowCornerCloseGlyphPath(ownerDocument: Document): SVGPathElement {
  const path = ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M1.5 1.5 L8.5 8.5 M8.5 1.5 L1.5 8.5');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.5');
  path.setAttribute('stroke-linecap', 'round');
  return path;
}
