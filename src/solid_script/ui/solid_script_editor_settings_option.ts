import { SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';

/**
 * Builds a Settings option row: a label that uses the editor's font and colour,
 * like Can Be Used As, not the muted monospace of the modifier stack.
 *
 * @param hint Hover text.
 * @param parts Label text and the control, in order.
 * @returns Row.
 */
export function solidScriptSettingsOption(hint: string, ...parts: (string | Node)[]): HTMLLabelElement {
  const row = document.createElement('label');
  row.className = SOLID_SCRIPT_EDITOR_CLASSES.settingsOption;
  row.title = hint;
  row.append(...parts);
  return row;
}

/**
 * Builds a Settings checkbox row: the box and its visible name, in the same
 * style as every other Settings option.
 *
 * @param label Visible name, also the accessible name of the box.
 * @param hint Hover text.
 * @returns Box and its row.
 */
export function solidScriptSettingsCheckbox(
  label: string,
  hint: string,
): { box: HTMLInputElement; element: HTMLLabelElement } {
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.setAttribute('aria-label', label);
  return { box, element: solidScriptSettingsOption(hint, box, label) };
}
