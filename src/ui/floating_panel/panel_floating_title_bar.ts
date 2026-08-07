import { Theme } from '@/theme.js';
import { hexToRgb } from '@/utils/utils_color.js';

/** Options for building a standard floating tool-window title bar. */
export interface FloatingPanelTitleBarOptions {
  /** Document that owns the created elements. */
  ownerDocument?: Document;
  /** Title text shown in the bar. */
  titleText: string;
  /** Optional pre-created title element; when omitted a span is created. */
  titleElement?: HTMLElement;
  /** Invoked when the close control is activated. */
  onClose: () => void;
  /** Horizontal and vertical padding CSS (default `8px 10px`). */
  padding?: string;
  /** When true, uses a monospace title font. */
  monospaceTitle?: boolean;
  /** When true, the bar does not grow/shrink in a flex column. */
  flexShrinkZero?: boolean;
}

/** Parts of a floating panel title bar for further customization. */
export interface FloatingPanelTitleBarParts {
  /** Root title bar element. */
  bar: HTMLElement;
  /** Title label element. */
  title: HTMLElement;
  /** Close button element. */
  closeButton: HTMLButtonElement;
}

/**
 * Builds a standard floating tool-window title bar (title + close).
 *
 * @param options Title text, close handler, and layout options.
 * @returns Title bar parts ready for drag binding and mounting.
 */
export function buildFloatingPanelTitleBar(options: FloatingPanelTitleBarOptions): FloatingPanelTitleBarParts {
  const ownerDocument = options.ownerDocument ?? document;
  const bar = ownerDocument.createElement('div');
  styleFloatingPanelTitleBarRoot(bar, options.padding, options.flexShrinkZero === true);
  const title = options.titleElement ?? ownerDocument.createElement('span');
  styleFloatingPanelTitleLabel(title, options.titleText, options.monospaceTitle === true);
  const closeButton = createFloatingPanelCloseButton(ownerDocument, options.onClose);
  bar.appendChild(title);
  bar.appendChild(closeButton);
  return { bar, title, closeButton };
}

/**
 * Applies standard layout styles to a title bar root.
 *
 * @param bar Title bar element.
 * @param padding CSS padding value.
 * @param flexShrinkZero Whether to set flex-shrink to zero.
 */
export function styleFloatingPanelTitleBarRoot(
  bar: HTMLElement,
  padding: string = '8px 10px',
  flexShrinkZero: boolean = false,
): void {
  bar.style.display = 'flex';
  bar.style.alignItems = 'center';
  bar.style.gap = '6px';
  bar.style.padding = padding;
  bar.style.cursor = 'move';
  bar.style.borderBottom = `1px solid ${hexToRgb(Theme.separatorColor)}`;
  if (flexShrinkZero) {
    bar.style.flexShrink = '0';
  }
}

/**
 * Applies standard styles to a floating panel title label.
 *
 * @param title Title element.
 * @param titleText Display text.
 * @param monospace Whether to use monospace font.
 */
export function styleFloatingPanelTitleLabel(title: HTMLElement, titleText: string, monospace: boolean = false): void {
  title.textContent = titleText;
  title.style.flex = '1';
  title.style.color = Theme.buttonTextColor;
  title.style.fontSize = '12px';
  title.style.fontWeight = '600';
  if (monospace) {
    title.style.fontFamily = 'monospace';
  }
}

/**
 * Creates a standard floating-panel close button.
 *
 * @param ownerDocument Document that owns the button.
 * @param onClose Close callback.
 * @returns Configured close button.
 */
export function createFloatingPanelCloseButton(ownerDocument: Document, onClose: () => void): HTMLButtonElement {
  const closeButton = ownerDocument.createElement('button');
  closeButton.type = 'button';
  closeButton.textContent = '×';
  closeButton.title = 'Close';
  styleFloatingPanelChromeButton(closeButton);
  closeButton.addEventListener('click', (event) => {
    event.stopPropagation();
    onClose();
  });
  return closeButton;
}

/**
 * Styles a compact chrome button used on floating tool windows.
 *
 * @param button Button to style.
 */
export function styleFloatingPanelChromeButton(button: HTMLButtonElement): void {
  button.style.border = `1px solid ${Theme.inputBorderColor}`;
  button.style.borderRadius = '3px';
  button.style.background = hexToRgb(Theme.buttonBackground);
  button.style.color = Theme.buttonTextColor;
  button.style.fontSize = '11px';
  button.style.padding = '2px 6px';
  button.style.cursor = 'pointer';
  button.style.fontFamily = Theme.uiFontFamily;
}
