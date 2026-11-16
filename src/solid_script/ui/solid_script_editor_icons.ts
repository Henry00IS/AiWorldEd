import { SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';

/** Line-art icons of the script editor, drawn in the current text colour. */
const SOLID_SCRIPT_EDITOR_ICON_PATHS: Readonly<Record<string, string>> = {
  Solids: '<path d="M8 1.5 14 4.75v6.5L8 14.5 2 11.25v-6.5z M2 4.75 8 8l6-3.25 M8 8v6.5"/>',
  Generators: '<path d="M2 14h12 M3 14v-3h3v-3h3v-3h3v9 M10.5 2.5l1-1 1 1-1 1z"/>',
  '2D Shapes': '<rect x="2.5" y="2.5" width="11" height="11" rx="1"/>',
  Transforms: '<path d="M8 1.5v13 M1.5 8h13 M8 1.5 6 3.5 M8 1.5l2 2 M14.5 8l-2-2 M14.5 8l-2 2"/>',
  Combine: '<circle cx="6" cy="8" r="4.5"/><circle cx="10" cy="8" r="4.5"/>',
  Meshes: '<path d="M2 13.5 8 2.5l6 11z M5 8h6 M8 2.5 5 8l3 5.5 3-5.5z"/>',
  Faces:
    '<path d="M2 5.5 8 2.5l6 3v6l-6 3-6-3z M2 5.5l6 3 6-3 M8 8.5v6"/><path d="M4 5.5 8 3.5l4 2-4 2z" fill="currentColor"/>',
  Lists:
    '<path d="M5.5 3.5h9 M5.5 8h9 M5.5 12.5h9"/><circle cx="2.5" cy="3.5" r="1"/><circle cx="2.5" cy="8" r="1"/><circle cx="2.5" cy="12.5" r="1"/>',
  Inputs: '<path d="M2 4.5h12 M2 11.5h12"/><circle cx="5.5" cy="4.5" r="1.8"/><circle cx="10.5" cy="11.5" r="1.8"/>',
  Logic:
    '<path d="M5.5 2C3.5 2 4 5 3 6.5 2.5 7.5 1.5 8 1.5 8s1 .5 1.5 1.5C4 11 3.5 14 5.5 14 M10.5 2c2 0 1.5 3 2.5 4.5.5 1 1.5 1.5 1.5 1.5s-1 .5-1.5 1.5c-1 1.5-.5 4.5-2.5 4.5"/>',
  Parts: '<path d="M2.5 5.5h3a1.5 1.5 0 1 1 3 0h3v3a1.5 1.5 0 1 1 0 3v2h-9z"/>',
  trace: '<path d="M2 4h7 M2 8h9 M2 12h5 M12 10.5l2 2-2 2"/>',
  script: '<path d="M4 1.5h6l3 3v10H4z M10 1.5v3h3 M6 7.5h5 M6 10h5 M6 12.5h3"/>',
  play: '<path d="M4.5 2.5v11l9-5.5z" fill="currentColor"/>',
  debug: '<path d="M3.5 2.5v11l6-5.5z" fill="currentColor"/><path d="M11 4.5v7 M13.5 4.5v7"/>',
  pause: '<path d="M4.5 2.5v11 M11.5 2.5v11" stroke-width="2.4"/>',
  step: '<path d="M3 2.5v11l7-5.5z" fill="currentColor"/><path d="M13 2.5v11" stroke-width="2"/>',
  stop: '<rect x="3.5" y="3.5" width="9" height="9" rx="1" fill="currentColor"/>',
  new: '<path d="M4 1.5h6l3 3v10H4z M10 1.5v3h3 M8.5 7v5 M6 9.5h5"/>',
  examples: '<path d="M2.5 3h4.5l1 1.5 1-1.5h4.5v10H9l-1 1-1-1H2.5z M8 4.5v9"/>',
  save: '<path d="M2.5 2.5h9l2 2v9h-11z M5 2.5v4h6v-4 M5 13.5v-4h6v4"/>',
  load: '<path d="M1.5 4.5v8.5h13v-7H8L6.5 4.5z"/>',
};

/**
 * Builds one icon.
 *
 * @param name Category or toolbar action.
 * @param color Stroke colour, or the text colour when omitted.
 * @returns Icon element.
 */
export function solidScriptEditorIcon(name: string, color = 'currentColor'): HTMLElement {
  const icon = document.createElement('span');
  icon.className = SOLID_SCRIPT_EDITOR_CLASSES.icon;
  icon.setAttribute('aria-hidden', 'true');
  icon.style.color = color;
  icon.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round">${SOLID_SCRIPT_EDITOR_ICON_PATHS[name] ?? ''}</svg>`;
  return icon;
}

/**
 * Builds a toolbar button.
 *
 * @param label Visible text.
 * @param icon Icon name.
 * @param hint Hover text.
 * @param onClick Click handler.
 * @returns Button.
 */
export function solidScriptEditorToolButton(
  label: string,
  icon: string,
  hint: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = SOLID_SCRIPT_EDITOR_CLASSES.tool;
  button.title = hint;
  const text = document.createElement('span');
  text.textContent = label;
  button.append(solidScriptEditorIcon(icon), text);
  button.addEventListener('click', onClick);
  return button;
}
