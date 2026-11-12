import { modifierStackUiPaint } from './modifier_stack_ui_paint.js';
import { MODIFIER_STACK_UI_CLASSES, modifierStackUiStylesheetEnsure } from './modifier_stack_ui_layout.js';

/**
 * Creates a text element in the inspector font, painted with the theme text
 * colour so it stays readable on the dark panel.
 *
 * @param tag Element tag.
 * @param text Text content.
 * @param muted True for secondary text.
 * @returns Styled element.
 */
export function modifierStackUiText<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text: string,
  muted = false,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.textContent = text;
  element.style.fontFamily = 'monospace';
  element.style.fontSize = muted ? '11px' : '12px';
  modifierStackUiPaint(element, 'text');
  element.style.opacity = muted ? '0.62' : '1';
  return element;
}

/**
 * Creates a compact square icon button for card headers.
 *
 * @param markup SVG or glyph markup.
 * @param title Tooltip and accessible name.
 * @param onClick Click handler.
 * @returns Button element.
 */
export function modifierStackUiIconButton(
  markup: string,
  title: string,
  onClick: (event: MouseEvent) => void,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.innerHTML = markup;
  button.title = title;
  button.setAttribute('aria-label', title);
  Object.assign(button.style, {
    width: '22px',
    height: '22px',
    padding: '0',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  });
  Object.assign(button.style, {
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    lineHeight: '0',
    flexShrink: '0',
    borderRadius: '4px',
  });
  modifierStackUiPaint(button, 'text');
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    onClick(event);
  });
  return button;
}

/**
 * Creates a full-width text button in the inspector style.
 *
 * @param label Visible label.
 * @param title Tooltip and accessible name.
 * @param onClick Click handler.
 * @returns Button element.
 */
export function modifierStackUiTextButton(
  label: string,
  title: string,
  onClick: (event: MouseEvent) => void,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.title = title;
  button.setAttribute('aria-label', title);
  Object.assign(button.style, {
    flex: '1',
    padding: '5px 8px',
    fontSize: '11px',
    fontFamily: 'monospace',
    cursor: 'pointer',
    borderRadius: '6px',
  });
  modifierStackUiPaint(button, 'button');
  button.addEventListener('click', onClick);
  return button;
}

/**
 * Builds one labelled row: a flexible caption beside a control that fills the
 * remaining width, stacked label-over-control in a narrow inspector. The
 * caption carries its full text and the hint as a tooltip.
 *
 * @param label Caption.
 * @param control Control element.
 * @param hint Optional tooltip.
 * @returns Row element.
 */
export function modifierStackUiRow(label: string, control: HTMLElement, hint?: string): HTMLElement {
  modifierStackUiStylesheetEnsure();
  const row = document.createElement('div');
  row.className = MODIFIER_STACK_UI_CLASSES.row;
  const caption = modifierStackUiText('span', label);
  caption.className = MODIFIER_STACK_UI_CLASSES.label;
  caption.title = hint ? `${label}: ${hint}` : label;
  if (hint) row.title = hint;
  control.classList.add(MODIFIER_STACK_UI_CLASSES.control);
  Object.assign(control.style, { flex: '', minWidth: '0', width: '100%', maxWidth: 'none', boxSizing: 'border-box' });
  row.append(caption, control);
  return row;
}

/**
 * Builds a checkbox row: the box first, then its caption, so short toggles
 * never wrap or truncate.
 *
 * @param label Caption.
 * @param checkbox Checkbox input.
 * @param hint Optional tooltip.
 * @returns Row element.
 */
export function modifierStackUiToggleRow(label: string, checkbox: HTMLInputElement, hint?: string): HTMLElement {
  modifierStackUiStylesheetEnsure();
  const row = document.createElement('label');
  row.className = `${MODIFIER_STACK_UI_CLASSES.row} ${MODIFIER_STACK_UI_CLASSES.toggle}`;
  const caption = modifierStackUiText('span', label);
  caption.className = MODIFIER_STACK_UI_CLASSES.label;
  row.title = hint ? `${label}: ${hint}` : label;
  Object.assign(checkbox.style, { margin: '0', width: 'auto' });
  row.append(checkbox, caption);
  return row;
}

/**
 * Creates a small uppercase group caption, the same in every card.
 *
 * @param text Caption text.
 * @returns Caption element.
 */
export function modifierStackUiCaption(text: string): HTMLElement {
  modifierStackUiStylesheetEnsure();
  const caption = modifierStackUiText('div', text, true);
  caption.className = MODIFIER_STACK_UI_CLASSES.caption;
  return caption;
}

/** Glyphs used by modifier cards. */
export const MODIFIER_STACK_UI_GLYPHS = {
  open: '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  closed:
    '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M3.5 2l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  plus: '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1v8M1 5h8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  more: '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><g fill="currentColor"><circle cx="3" cy="7" r="1.3"/><circle cx="7" cy="7" r="1.3"/><circle cx="11" cy="7" r="1.3"/></g></svg>',
} as const;
