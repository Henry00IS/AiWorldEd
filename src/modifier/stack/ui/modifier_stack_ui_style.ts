import { modifierStackUiPaint } from './modifier_stack_ui_paint.js';

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
 * Builds one labelled row: caption on the left, control stretched beside it.
 *
 * @param label Caption.
 * @param control Control element.
 * @param hint Optional tooltip.
 * @returns Row element.
 */
export function modifierStackUiRow(label: string, control: HTMLElement, hint?: string): HTMLElement {
  const row = document.createElement('div');
  Object.assign(row.style, { display: 'flex', alignItems: 'center', gap: '6px', padding: '0 8px 6px' });
  const caption = modifierStackUiText('span', label);
  Object.assign(caption.style, {
    width: '11ch',
    flexShrink: '0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  });
  if (hint) row.title = hint;
  Object.assign(control.style, { flex: '1', minWidth: '0', width: '100%', maxWidth: 'none' });
  row.append(caption, control);
  return row;
}

/** Glyphs used by modifier cards. */
export const MODIFIER_STACK_UI_GLYPHS = {
  grip: '<svg width="10" height="14" viewBox="0 0 10 14" aria-hidden="true"><g fill="currentColor"><circle cx="3" cy="3" r="1.2"/><circle cx="7" cy="3" r="1.2"/><circle cx="3" cy="7" r="1.2"/><circle cx="7" cy="7" r="1.2"/><circle cx="3" cy="11" r="1.2"/><circle cx="7" cy="11" r="1.2"/></g></svg>',
  open: '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  closed:
    '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M3.5 2l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  more: '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><g fill="currentColor"><circle cx="3" cy="7" r="1.3"/><circle cx="7" cy="7" r="1.3"/><circle cx="11" cy="7" r="1.3"/></g></svg>',
} as const;
