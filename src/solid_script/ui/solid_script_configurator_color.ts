import { solidScriptColorResolve } from '@/solid_script/language/solid_script_color.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';

/**
 * Puts a colour picker before the text input of a Color field. Picking writes
 * the colour as hex into the text, and typed text that names a colour moves the
 * picker to it, so a [variable] can still be typed.
 *
 * @param input Text input with the stored text.
 * @param inputs Container of the field's inputs.
 */
export function solidScriptConfiguratorColorAttach(input: HTMLInputElement, inputs: HTMLElement): void {
  const swatch = document.createElement('input');
  swatch.type = 'color';
  swatch.className = SOLID_SCRIPT_EDITOR_CLASSES.colorSwatch;
  swatch.setAttribute('aria-label', 'Pick Color');
  swatch.title = 'Pick a colour; it is written into the field as hex, such as #ff8800';
  const follow = (): void => {
    const color = solidScriptColorResolve(input.value);
    if (color !== null) swatch.value = color;
  };
  follow();
  swatch.addEventListener('input', (event) => {
    event.stopPropagation();
    input.value = swatch.value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  input.addEventListener('input', follow);
  inputs.append(swatch, input);
}
