import { Theme } from '@/theme.js';
import { getActiveUiThemePalette } from '@/ui/theme/theme_ui_palette.js';

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
  closeButton.textContent = '×';
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
  const palette = getActiveUiThemePalette();
  closeButton.style.position = 'absolute';
  closeButton.style.top = '0';
  closeButton.style.right = '0';
  closeButton.style.width = palette.windowCloseButtonSize;
  closeButton.style.height = palette.windowCloseButtonSize;
  closeButton.style.margin = '0';
  closeButton.style.padding = '0';
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
  bindWindowCornerCloseButtonHover(closeButton);
}

/**
 * Binds the instant-on / fading-off hover behavior to a corner close button.
 *
 * @param closeButton Button to bind.
 */
function bindWindowCornerCloseButtonHover(closeButton: HTMLButtonElement): void {
  closeButton.addEventListener('mouseenter', () => {
    closeButton.style.transition = 'none';
    closeButton.style.background = getActiveUiThemePalette().windowCloseButtonHoverBackground;
  });
  closeButton.addEventListener('mouseleave', () => {
    closeButton.style.transition = 'background-color 150ms ease';
    closeButton.style.background = 'transparent';
  });
}
