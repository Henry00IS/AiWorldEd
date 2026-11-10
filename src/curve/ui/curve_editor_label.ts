import { CURVE_UI_COLORS } from './curve_ui_style.js';

/**
 * Creates a caption for a control.
 *
 * @param text Caption text.
 * @returns Label element.
 */
export function curveEditorLabel(text: string): HTMLElement {
  const label = document.createElement('span');
  label.textContent = text;
  Object.assign(label.style, { color: CURVE_UI_COLORS.text, fontSize: '11px', marginLeft: '6px' });
  return label;
}

/**
 * Creates a group that keeps a caption on the same toolbar line as its control
 * when the row wraps.
 *
 * @returns Group element.
 */
export function curveEditorGroup(): HTMLElement {
  const group = document.createElement('span');
  Object.assign(group.style, { display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' });
  return group;
}
