import { Theme } from '@/theme.js';
import { ToolbarIcons } from '@/ui/toolbar/toolbar_icons.js';

/**
 * Creates a compact figurine toolbar button for drag-and-drop placement.
 *
 * @param ownerDocument Document that owns the button.
 * @param onPointerDown Handler for starting a figurine drag.
 * @param onActivateClick Handler for click when not dragging (reset spawn).
 * @returns Configured button element.
 */
export function playerFigurineCreateToolbarButton(
  ownerDocument: Document,
  onPointerDown: (event: PointerEvent) => void,
  onActivateClick: () => void,
): HTMLButtonElement {
  const button = ownerDocument.createElement('button');
  button.type = 'button';
  button.title = 'Drag into the scene to place play spawn (click to clear)';
  button.setAttribute('aria-label', 'Place play-mode figurine');
  button.innerHTML = ToolbarIcons.playerFigurine();
  applyButtonStyles(button);
  wireButtonEvents(button, onPointerDown, onActivateClick);
  return button;
}

/**
 * Applies viewport-toolbar-matching styles to the figurine button.
 *
 * @param button Button to style.
 */
function applyButtonStyles(button: HTMLButtonElement): void {
  button.style.display = 'inline-flex';
  button.style.alignItems = 'center';
  button.style.justifyContent = 'center';
  button.style.width = '24px';
  button.style.height = '24px';
  button.style.padding = '0';
  button.style.margin = '0';
  button.style.border = '1px solid transparent';
  button.style.borderRadius = '4px';
  button.style.background = 'transparent';
  button.style.color = Theme.buttonTextColor;
  button.style.cursor = 'grab';
  button.style.lineHeight = '0';
  button.style.flexShrink = '0';
}

/**
 * Wires drag placement on pointer-down and reset on click without a drag.
 *
 * @param button Figurine button.
 * @param onPointerDown Drag begin handler.
 * @param onActivateClick Click/reset handler when no drag occurred.
 */
function wireButtonEvents(
  button: HTMLButtonElement,
  onPointerDown: (event: PointerEvent) => void,
  onActivateClick: () => void,
): void {
  let pointerDownClientX = 0;
  let pointerDownClientY = 0;
  let didDrag = false;
  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) {
      return;
    }
    pointerDownClientX = event.clientX;
    pointerDownClientY = event.clientY;
    didDrag = false;
    onPointerDown(event);
  });
  button.addEventListener('pointermove', (event) => {
    if ((event.buttons & 1) === 0) {
      return;
    }
    const dx = event.clientX - pointerDownClientX;
    const dy = event.clientY - pointerDownClientY;
    if (dx * dx + dy * dy > 9) {
      didDrag = true;
    }
  });
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    if (didDrag) {
      didDrag = false;
      return;
    }
    onActivateClick();
  });
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
}

/**
 * Updates the active appearance of a figurine button when a spawn is placed.
 *
 * @param button Figurine button.
 * @param active Whether a spawn point is currently placed.
 */
export function playerFigurineSetButtonActive(button: HTMLButtonElement, active: boolean): void {
  button.dataset['active'] = active ? 'true' : 'false';
  button.setAttribute('aria-pressed', active ? 'true' : 'false');
  if (active) {
    button.style.background = hexToRgba(Theme.selectionColor, 0.28);
    button.style.borderColor = hexToRgba(Theme.selectionColor, 0.85);
    button.style.color = '#ffffff';
    return;
  }
  button.style.background = 'transparent';
  button.style.borderColor = 'transparent';
  button.style.color = Theme.buttonTextColor;
}

/**
 * Converts a hex color number to an rgba CSS string.
 *
 * @param hex Hex color value.
 * @param alpha Alpha channel from 0 to 1.
 * @returns CSS rgba color string.
 */
function hexToRgba(hex: number, alpha: number): string {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
