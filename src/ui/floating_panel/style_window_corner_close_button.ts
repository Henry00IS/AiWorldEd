import { Theme } from '@/theme.js';
import { getActiveUiThemePalette } from '@/ui/theme/theme_ui_palette.js';

/**
 * Shared height for floating-window title bars and the square Windows 11-style
 * corner close button that fills the top-right of that bar.
 */
export const WINDOW_TITLE_BAR_HEIGHT_PX = 32;

/** Marks a close button whose hover listeners are already bound. */
const CLOSE_HOVER_BOUND_ATTRIBUTE = 'data-aiworlded-close-hover-bound';

/** Marks the optically-centered close glyph span. */
const CLOSE_GLYPH_ATTRIBUTE = 'data-aiworlded-close-glyph';

/**
 * Creates a Windows 11-style corner close button. It sits flush in the
 * top-right corner of its window, spans the full title-bar height with an equal
 * width, shows a bare centered X with no border, turns solid red instantly on
 * hover, and fades back to transparent when the pointer leaves.
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
  applyWindowCornerCloseButtonLayout(closeButton);
  applyWindowCornerCloseButtonChrome(closeButton);
  ensureWindowCornerCloseGlyph(closeButton);
  bindWindowCornerCloseButtonHover(closeButton);
}

/**
 * Positions the close button as a square flush with the top-right of its title
 * bar.
 *
 * @param closeButton Button to position.
 */
function applyWindowCornerCloseButtonLayout(closeButton: HTMLButtonElement): void {
  const sizePx = `${WINDOW_TITLE_BAR_HEIGHT_PX}px`;
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
  closeButton.style.border = 'none';
  closeButton.style.borderRadius = '0';
  closeButton.style.background = 'transparent';
  closeButton.style.color = palette.windowCloseButtonGlyphColor;
  closeButton.style.cursor = 'pointer';
  closeButton.style.display = 'inline-flex';
  closeButton.style.alignItems = 'center';
  closeButton.style.justifyContent = 'center';
  closeButton.style.fontSize = '16px';
  closeButton.style.lineHeight = '1';
  closeButton.style.fontFamily = Theme.uiFontFamily;
  closeButton.style.transition = 'background-color 150ms ease';
  closeButton.style.zIndex = '1';
}

/**
 * Ensures the close glyph is a single optically-centered span (× sits high in
 * most fonts when flex-centered alone).
 *
 * @param closeButton Button that should show the glyph.
 */
function ensureWindowCornerCloseGlyph(closeButton: HTMLButtonElement): void {
  let glyph = closeButton.querySelector(`[${CLOSE_GLYPH_ATTRIBUTE}="1"]`) as HTMLElement | null;
  if (!glyph) {
    closeButton.textContent = '';
    glyph = closeButton.ownerDocument.createElement('span');
    glyph.setAttribute(CLOSE_GLYPH_ATTRIBUTE, '1');
    glyph.textContent = '×';
    closeButton.appendChild(glyph);
  }
  glyph.style.display = 'block';
  glyph.style.lineHeight = '1';
  glyph.style.transform = 'translateY(2px)';
}

/**
 * Binds the instant-on / fading-off hover behavior once per close button.
 *
 * @param closeButton Button to bind.
 */
function bindWindowCornerCloseButtonHover(closeButton: HTMLButtonElement): void {
  if (closeButton.getAttribute(CLOSE_HOVER_BOUND_ATTRIBUTE) === '1') {
    return;
  }
  closeButton.setAttribute(CLOSE_HOVER_BOUND_ATTRIBUTE, '1');
  closeButton.addEventListener('mouseenter', () => {
    closeButton.style.transition = 'none';
    closeButton.style.background = getActiveUiThemePalette().windowCloseButtonHoverBackground;
  });
  closeButton.addEventListener('mouseleave', () => {
    closeButton.style.transition = 'background-color 150ms ease';
    closeButton.style.background = 'transparent';
  });
}
