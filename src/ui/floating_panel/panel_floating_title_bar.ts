import { Theme } from '@/theme.js';
import { hexToRgb } from '@/utils/utils_color.js';
import {
  createWindowCornerCloseButton,
  WINDOW_CLOSE_BUTTON_SIZE_PX,
  WINDOW_TITLE_BAR_HEIGHT_PX,
} from './style_window_corner_close_button.js';

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
  /**
   * Left padding CSS for the title text (default `10px`). Vertical padding is
   * ignored so the bar height always matches the close button.
   */
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
  const closeButton = createWindowCornerCloseButton(ownerDocument, options.onClose);
  bar.appendChild(title);
  bar.appendChild(closeButton);
  return { bar, title, closeButton };
}

/**
 * Applies standard layout styles to a title bar root so its height always
 * matches the corner close button and the glyph cannot spill into content.
 *
 * @param bar Title bar element.
 * @param padding Optional padding string; only the horizontal/left value is
 *   used as left padding.
 * @param flexShrinkZero Whether to set flex-shrink to zero.
 */
export function styleFloatingPanelTitleBarRoot(
  bar: HTMLElement,
  padding: string = '10px',
  flexShrinkZero: boolean = false,
): void {
  bar.style.position = 'relative';
  bar.style.display = 'flex';
  bar.style.alignItems = 'center';
  bar.style.gap = '6px';
  bar.style.boxSizing = 'border-box';
  bar.style.height = `${WINDOW_TITLE_BAR_HEIGHT_PX}px`;
  bar.style.paddingTop = '0';
  bar.style.paddingBottom = '0';
  bar.style.paddingLeft = resolveTitleBarPaddingLeft(padding);
  bar.style.paddingRight = `${WINDOW_CLOSE_BUTTON_SIZE_PX}px`;
  bar.style.overflow = 'hidden';
  bar.style.cursor = 'move';
  bar.style.boxShadow = `inset 0 -1px 0 ${hexToRgb(Theme.separatorColor)}`;
  bar.style.borderBottom = 'none';
  if (flexShrinkZero) {
    bar.style.flexShrink = '0';
  }
}

/**
 * Resolves the left padding for a title bar from a CSS padding shorthand.
 *
 * @param padding CSS padding value (one to four parts).
 * @returns Left padding CSS length.
 */
function resolveTitleBarPaddingLeft(padding: string): string {
  const parts = padding
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);
  if (parts.length === 0) {
    return '10px';
  }
  if (parts.length === 1) {
    return parts[0]!;
  }
  if (parts.length === 2 || parts.length === 3) {
    return parts[1]!;
  }
  return parts[3]!;
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
  title.style.minWidth = '0';
  title.style.overflow = 'hidden';
  title.style.textOverflow = 'ellipsis';
  title.style.whiteSpace = 'nowrap';
  title.style.color = Theme.buttonTextColor;
  title.style.fontSize = '12px';
  title.style.fontWeight = '600';
  if (monospace) {
    title.style.fontFamily = 'monospace';
  }
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
