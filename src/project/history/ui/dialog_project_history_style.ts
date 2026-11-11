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

/** Padlock: named snapshots are kept until deleted. */
export const DIALOG_PROJECT_HISTORY_LOCK_ICON =
  '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2" fill="currentColor"/>' +
  '<path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>';

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
 * Builds the "You Are Here" thumbnail: the live editor, not a saved image.
 *
 * @param large Whether it is the detail panel's.
 * @returns Box.
 */
export function dialogProjectHistoryHereThumb(large: boolean): HTMLElement {
  const box = document.createElement('div');
  Object.assign(box.style, {
    width: large ? '100%' : '52px',
    height: large ? '110px' : '52px',
    borderRadius: large ? '8px' : '5px',
    border: `1.5px dashed ${DIALOG_PROJECT_HISTORY_ACCENT}`,
    background: 'rgba(232,106,23,0.08)',
    display: 'grid',
    placeItems: 'center',
    color: DIALOG_PROJECT_HISTORY_ACCENT_TEXT,
    fontSize: large ? '13px' : '11px',
    fontWeight: '700',
    boxSizing: 'border-box',
    flex: 'none',
  });
  box.textContent = large ? 'Live In The Editor' : 'Live';
  return box;
}

/**
 * Builds a list of labelled values.
 *
 * @param fields Label, value and optional tooltip.
 * @returns List.
 */
export function dialogProjectHistoryFields(fields: ReadonlyArray<readonly [string, string, string?]>): HTMLElement {
  const list = document.createElement('dl');
  Object.assign(list.style, { display: 'grid', gridTemplateColumns: '78px 1fr', gap: '6px 10px', margin: '0' });
  list.style.fontSize = '12px';
  for (const [label, value, tip] of fields) {
    const term = document.createElement('dt');
    term.textContent = label;
    term.style.color = DIALOG_PROJECT_HISTORY_TEXT_MUTED;
    const data = document.createElement('dd');
    data.textContent = value;
    Object.assign(data.style, { margin: '0', color: DIALOG_PROJECT_HISTORY_TEXT_MAIN, overflowWrap: 'anywhere' });
    if (tip !== undefined) data.title = tip;
    list.append(term, data);
  }
  return list;
}

/**
 * Builds a highlighted note.
 *
 * @param text Note.
 * @returns Note element.
 */
export function dialogProjectHistoryNote(text: string): HTMLElement {
  const note = dialogProjectHistoryText(text, DIALOG_PROJECT_HISTORY_TEXT_SOFT);
  Object.assign(note.style, {
    display: 'block',
    whiteSpace: 'normal',
    lineHeight: '1.45',
    fontSize: '12px',
    marginTop: '10px',
    padding: '7px 10px',
    borderRadius: '6px',
    borderLeft: `3px solid ${DIALOG_PROJECT_HISTORY_ACCENT}`,
    background: 'rgba(232,106,23,0.08)',
  });
  return note;
}

/**
 * Builds the padlock of a named snapshot.
 *
 * @returns Padlock element, described for screen readers.
 */
export function dialogProjectHistoryLock(): HTMLElement {
  const chip = document.createElement('span');
  chip.innerHTML = DIALOG_PROJECT_HISTORY_LOCK_ICON;
  chip.title = 'Named: kept until you delete it';
  chip.setAttribute('role', 'img');
  chip.setAttribute('aria-label', 'Named, kept until you delete it');
  Object.assign(chip.style, {
    display: 'inline-grid',
    placeItems: 'center',
    color: DIALOG_PROJECT_HISTORY_ACCENT_TEXT,
  });
  return chip;
}

/**
 * Builds a text field in the dialog's style.
 *
 * @param label Accessible label in Title Case.
 * @param value Initial value.
 * @param maxLength Longest value.
 * @returns Input.
 */
export function dialogProjectHistoryInput(label: string, value: string, maxLength: number): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.maxLength = maxLength;
  input.placeholder = label;
  input.setAttribute('aria-label', label);
  Object.assign(input.style, dialogProjectHistoryFieldStyle());
  return input;
}

/**
 * Returns the style of the dialog's text fields.
 *
 * @returns Style.
 */
export function dialogProjectHistoryFieldStyle(): Partial<CSSStyleDeclaration> {
  return {
    width: '100%',
    boxSizing: 'border-box',
    padding: '6px 8px',
    borderRadius: '6px',
    border: `1px solid ${DIALOG_PROJECT_HISTORY_ACCENT}`,
    background: 'rgba(0,0,0,0.35)',
    color: DIALOG_PROJECT_HISTORY_TEXT_MAIN,
    fontSize: '13px',
    fontFamily: Theme.uiFontFamily,
  };
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
