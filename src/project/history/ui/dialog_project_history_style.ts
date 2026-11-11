import { Theme } from '@/theme.js';
import { hexToRgb } from '@/utils/utils_color.js';
import {
  VIRTUAL_LIST_SCROLLBAR_BIND_SCROLLER_CLASS,
  virtualListScrollbarBind,
  virtualListScrollbarBindStylesEnsure,
  virtualListScrollbarGutterSync,
  type VirtualListScrollbarBinding,
} from '@/ui/virtual_list/virtual_list_scrollbar_bind.js';

/** Main text; at least 7:1 contrast on every dialog surface. */
export const DIALOG_PROJECT_HISTORY_TEXT_MAIN = '#f2f2f2';
/** Secondary text; at least 7:1 contrast on every dialog surface. */
export const DIALOG_PROJECT_HISTORY_TEXT_SOFT = '#c8c8c8';
/** Muted text; at least 7:1 contrast, also on a selected row. */
export const DIALOG_PROJECT_HISTORY_TEXT_MUTED = '#b4b4b4';
/** Accent for lines, borders and markers of the current work. */
export const DIALOG_PROJECT_HISTORY_ACCENT = hexToRgb(Theme.selectionColor);
/** Accent for text; at least 7:1 contrast, also on a selected row. */
export const DIALOG_PROJECT_HISTORY_ACCENT_TEXT = '#ffa25e';
/** Text of destructive actions; at least 7:1 contrast. */
export const DIALOG_PROJECT_HISTORY_DANGER_TEXT = '#ffb4a6';
/** Background of a selected row or item. */
export const DIALOG_PROJECT_HISTORY_SELECTED = 'rgba(232,106,23,0.13)';

/** Star of a save, filled when starred. */
export const DIALOG_PROJECT_HISTORY_STAR_ICON =
  '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z" ' +
  'fill="var(--history-star-fill)" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';

/** Trash can of the delete button. */
export const DIALOG_PROJECT_HISTORY_TRASH_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6" ' +
  'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** Gold of a set star. */
export const DIALOG_PROJECT_HISTORY_STAR_COLOR = '#ffcf4d';

/** Arrow step of the pane scrollbars in CSS pixels. */
const DIALOG_PROJECT_HISTORY_SCROLL_STEP_PX = 32;

/** A pane that scrolls under the editor's custom scrollbar. */
export interface DialogProjectHistoryPane {
  /** Positioned frame holding the scroller and the scrollbar. */
  host: HTMLElement;
  /** Element that scrolls. */
  scroller: HTMLElement;
  /** Content inside the scroller. */
  content: HTMLElement;
  /** Reserves the scrollbar gutter while the content overflows. */
  sync(): void;
  /** Removes the scrollbar. */
  dispose(): void;
}

/**
 * Builds a pane with the editor's custom scrollbar (the Outliner's).
 *
 * @param padding CSS padding of the content.
 * @returns Pane.
 */
export function dialogProjectHistoryPane(padding: string): DialogProjectHistoryPane {
  virtualListScrollbarBindStylesEnsure();
  const host = document.createElement('div');
  Object.assign(host.style, {
    position: 'relative',
    overflow: 'hidden',
    minHeight: '0',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '8px',
    background: 'rgba(0,0,0,0.22)',
  });
  const scroller = document.createElement('div');
  scroller.className = VIRTUAL_LIST_SCROLLBAR_BIND_SCROLLER_CLASS;
  Object.assign(scroller.style, { position: 'absolute', inset: '0', overflowY: 'auto', overflowX: 'hidden' });
  const content = document.createElement('div');
  Object.assign(content.style, { padding, boxSizing: 'border-box' });
  scroller.append(content);
  host.append(scroller);
  const binding: VirtualListScrollbarBinding = virtualListScrollbarBind(
    host,
    scroller,
    DIALOG_PROJECT_HISTORY_SCROLL_STEP_PX,
    [content],
  );
  const sync = () => virtualListScrollbarGutterSync(scroller, binding, 0);
  // The gutter follows every size change, not only redraws: a note growing as
  // it is typed or a picture loading can make the content overflow later.
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(sync);
  for (const element of [scroller, content]) observer?.observe(element);
  const dispose = () => {
    observer?.disconnect();
    binding.dispose();
  };
  return { host, scroller, content, sync, dispose };
}

/**
 * Builds a text span that ends with an ellipsis when too long.
 *
 * @param text Text.
 * @param color CSS color.
 * @returns Span.
 */
export function dialogProjectHistoryText(text: string, color: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.textContent = text;
  Object.assign(span.style, { color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
  return span;
}

/**
 * Builds a small heading.
 *
 * @param text Heading in Title Case.
 * @returns Heading.
 */
export function dialogProjectHistoryHeading(text: string): HTMLElement {
  const heading = dialogProjectHistoryText(text, DIALOG_PROJECT_HISTORY_TEXT_MUTED);
  Object.assign(heading.style, { display: 'block', fontSize: '11px', letterSpacing: '0.04em', fontWeight: '600' });
  return heading;
}

/**
 * Builds a thumbnail box, with a striped placeholder while there is none.
 *
 * @param url Thumbnail URL, or null.
 * @param size CSS edge, or null to fill the width.
 * @returns Box.
 */
export function dialogProjectHistoryThumb(url: string | null, size: number | null): HTMLElement {
  const box = document.createElement('div');
  Object.assign(box.style, {
    width: size === null ? '100%' : `${size}px`,
    maxWidth: '256px',
    aspectRatio: '1',
    borderRadius: size === null ? '8px' : '5px',
    border: '1px solid rgba(255,255,255,0.12)',
    background:
      url === null
        ? 'repeating-linear-gradient(45deg, #26262a 0 6px, #2c2c31 6px 12px)'
        : `#232323 center / cover no-repeat url("${url}")`,
    boxSizing: 'border-box',
    flex: 'none',
  });
  return box;
}

/**
 * Builds the AUTOSAVE pill of a save.
 *
 * @returns Pill.
 */
export function dialogProjectHistoryPill(): HTMLElement {
  const pill = document.createElement('span');
  pill.textContent = 'AUTOSAVE';
  pill.dataset['historyPill'] = 'autosave';
  Object.assign(pill.style, {
    display: 'inline-block',
    padding: '0 7px',
    lineHeight: '18px',
    borderRadius: '2em',
    border: '1px solid rgba(200,200,200,0.6)',
    color: DIALOG_PROJECT_HISTORY_TEXT_MAIN,
    fontSize: '10.5px',
    fontWeight: '600',
    letterSpacing: '0.04em',
    flex: 'none',
  });
  return pill;
}

/**
 * Builds a square icon button.
 *
 * @param icon SVG markup.
 * @param label Accessible label in Title Case.
 * @param size Edge in CSS pixels.
 * @param onClick Click handler.
 * @returns Button.
 */
export function dialogProjectHistoryIconButton(
  icon: string,
  label: string,
  size: number,
  onClick: () => void,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.innerHTML = icon;
  button.setAttribute('aria-label', label);
  Object.assign(button.style, {
    width: `${size}px`,
    height: `${size}px`,
    display: 'grid',
    placeItems: 'center',
    padding: '0',
    borderRadius: '6px',
    border: '1px solid transparent',
    background: 'transparent',
    color: DIALOG_PROJECT_HISTORY_TEXT_SOFT,
    cursor: 'pointer',
    flex: 'none',
  });
  dialogProjectHistoryFocusRing(button, 'none');
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    onClick();
  });
  button.addEventListener('dblclick', (event) => event.stopPropagation());
  return button;
}

/**
 * Tells whether the user asked for reduced motion.
 *
 * @returns True to avoid animations.
 */
export function dialogProjectHistoryReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Shows a visible focus ring on an element while it has keyboard focus.
 *
 * @param element Focusable element.
 * @param rest Box shadow while not focused.
 */
export function dialogProjectHistoryFocusRing(element: HTMLElement, rest: string): void {
  element.style.outline = 'none';
  element.style.boxShadow = rest;
  element.addEventListener(
    'focus',
    () => (element.style.boxShadow = `inset 0 0 0 2px ${DIALOG_PROJECT_HISTORY_ACCENT}`),
  );
  element.addEventListener('blur', () => (element.style.boxShadow = rest));
}
