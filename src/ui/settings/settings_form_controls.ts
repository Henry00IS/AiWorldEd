import { Theme } from '../../theme.js';
import { hexToRgb } from '../../utils/color_utils.js';

/**
 * Shared form control factories for the settings dialog.
 * Uses the same Theme tokens as properties panel and toolbar controls.
 */

/**
 * Creates a category section with a title and body stack.
 * @param title Category heading text.
 * @returns Section element and body container for controls.
 */
export function createSettingsCategory(title: string): {
  section: HTMLElement;
  body: HTMLElement;
} {
  const section = document.createElement('section');
  section.classList.add('settings-dialog-category');
  section.style.display = 'flex';
  section.style.flexDirection = 'column';
  section.style.gap = '8px';
  section.style.padding = '10px 0';
  section.style.borderBottom = `1px solid ${hexToRgb(Theme.separatorColor)}`;
  const heading = document.createElement('h3');
  heading.classList.add('settings-dialog-category-title');
  heading.textContent = title;
  styleCategoryHeading(heading);
  const body = document.createElement('div');
  body.classList.add('settings-dialog-category-content');
  body.style.display = 'flex';
  body.style.flexDirection = 'column';
  body.style.gap = '8px';
  section.appendChild(heading);
  section.appendChild(body);
  return { section, body };
}

/**
 * Creates a labeled control row.
 * @param labelText Left-side label.
 * @param control Right-side control element.
 * @returns Row element.
 */
export function createSettingsControlRow(
  labelText: string,
  control: HTMLElement
): HTMLElement {
  const row = document.createElement('div');
  row.classList.add('settings-dialog-control-row');
  row.style.display = 'flex';
  row.style.alignItems = 'center';
  row.style.justifyContent = 'space-between';
  row.style.gap = '12px';
  const label = document.createElement('label');
  label.classList.add('settings-dialog-control-label');
  label.textContent = labelText;
  styleSettingsLabel(label);
  control.style.flex = '0 1 220px';
  control.style.maxWidth = '240px';
  row.appendChild(label);
  row.appendChild(control);
  return row;
}

/**
 * Creates a styled select dropdown.
 * @param options Value/label pairs.
 * @param selectedValue Currently selected value.
 * @param onChange Change handler receiving the new value.
 * @returns Select element.
 */
export function createSettingsSelect(
  options: readonly { value: string; label: string }[],
  selectedValue: string,
  onChange: (value: string) => void
): HTMLSelectElement {
  const select = document.createElement('select');
  styleSettingsSelect(select);
  options.forEach((option) => {
    const element = document.createElement('option');
    element.value = option.value;
    element.textContent = option.label;
    select.appendChild(element);
  });
  select.value = selectedValue;
  select.addEventListener('change', () => onChange(select.value));
  return select;
}

/**
 * Creates a styled range slider with a live value readout.
 * @param min Inclusive minimum.
 * @param max Inclusive maximum.
 * @param step Step increment.
 * @param value Current value.
 * @param formatValue Formats the numeric value for display.
 * @param onChange Change handler for the numeric value.
 * @returns Wrapper containing the slider and readout.
 */
export function createSettingsSlider(
  min: number,
  max: number,
  step: number,
  value: number,
  formatValue: (value: number) => string,
  onChange: (value: number) => void
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.alignItems = 'center';
  wrapper.style.gap = '10px';
  wrapper.style.flex = '0 1 220px';
  wrapper.style.maxWidth = '240px';
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = String(min);
  slider.max = String(max);
  slider.step = String(step);
  slider.value = String(value);
  styleSettingsSlider(slider);
  const readout = document.createElement('span');
  readout.textContent = formatValue(value);
  styleSettingsReadout(readout);
  slider.addEventListener('input', () => {
    const nextValue = Number(slider.value);
    readout.textContent = formatValue(nextValue);
    onChange(nextValue);
  });
  wrapper.appendChild(slider);
  wrapper.appendChild(readout);
  return wrapper;
}

/**
 * Creates a compact primary action button.
 * @param label Button label.
 * @param onClick Click handler.
 * @returns Button element.
 */
export function createSettingsButton(
  label: string,
  onClick: () => void
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  styleSettingsButton(button);
  button.addEventListener('click', (event) => {
    event.preventDefault();
    onClick();
  });
  return button;
}

/**
 * Creates a secondary / muted action button matching editor chrome.
 * @param label Button label.
 * @param onClick Click handler.
 * @returns Button element.
 */
export function createSettingsSecondaryButton(
  label: string,
  onClick: () => void
): HTMLButtonElement {
  const button = createSettingsButton(label, onClick);
  button.style.background = hexToRgb(Theme.buttonBackground);
  button.style.color = Theme.buttonTextColor;
  button.style.border = `1px solid ${Theme.inputBorderColor}`;
  bindButtonHover(
    button,
    hexToRgb(Theme.buttonHoverColor),
    hexToRgb(Theme.buttonBackground)
  );
  return button;
}

/**
 * Creates a text input field.
 * @param value Current text.
 * @param ariaLabel Accessible name.
 * @param onChange Change handler for committed text.
 * @returns Input element.
 */
export function createSettingsTextInput(
  value: string,
  ariaLabel: string,
  onChange: (value: string) => void
): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.setAttribute('aria-label', ariaLabel);
  styleSettingsTextInput(input);
  input.addEventListener('change', () => onChange(input.value));
  return input;
}

/**
 * Styles a category heading like properties panel section titles.
 * @param heading Heading element.
 */
function styleCategoryHeading(heading: HTMLElement): void {
  heading.style.margin = '0';
  heading.style.fontSize = '11px';
  heading.style.fontWeight = 'bold';
  heading.style.fontFamily = 'monospace';
  heading.style.color = Theme.buttonTextColor;
  heading.style.letterSpacing = '0';
  heading.style.textTransform = 'none';
}

/**
 * Styles a field label.
 * @param label Label element.
 */
function styleSettingsLabel(label: HTMLElement): void {
  label.style.fontSize = '12px';
  label.style.color = Theme.buttonTextColor;
  label.style.fontFamily = Theme.uiFontFamily;
  label.style.flex = '1 1 auto';
}

/**
 * Styles a select control using editor input tokens.
 * @param select Select element.
 */
function styleSettingsSelect(select: HTMLSelectElement): void {
  select.style.width = '100%';
  select.style.boxSizing = 'border-box';
  select.style.padding = '4px 6px';
  select.style.borderRadius = '2px';
  select.style.border = `1px solid ${Theme.inputBorderColor}`;
  select.style.background = Theme.inputBackgroundColor;
  select.style.color = Theme.inputTextColor;
  select.style.fontFamily = Theme.uiFontFamily;
  select.style.fontSize = '12px';
  select.style.outline = 'none';
  select.style.cursor = 'pointer';
}

/**
 * Styles a range slider.
 * @param slider Range input.
 */
function styleSettingsSlider(slider: HTMLInputElement): void {
  slider.style.flex = '1 1 auto';
  slider.style.width = '100%';
  slider.style.accentColor = hexToRgb(Theme.selectionColor);
  slider.style.cursor = 'pointer';
}

/**
 * Styles a numeric readout next to a slider.
 * @param readout Readout element.
 */
function styleSettingsReadout(readout: HTMLElement): void {
  readout.style.minWidth = '42px';
  readout.style.textAlign = 'right';
  readout.style.fontSize = '11px';
  readout.style.color = Theme.statusBarTextColor;
  readout.style.fontFamily = 'monospace';
  readout.style.fontVariantNumeric = 'tabular-nums';
}

/**
 * Styles a settings action button like toolbar/panel buttons.
 * @param button Button element.
 */
function styleSettingsButton(button: HTMLButtonElement): void {
  button.style.cursor = 'pointer';
  button.style.border = `1px solid ${Theme.inputBorderColor}`;
  button.style.borderRadius = '4px';
  button.style.padding = '5px 10px';
  button.style.fontSize = '12px';
  button.style.fontWeight = '500';
  button.style.fontFamily = Theme.uiFontFamily;
  button.style.background = hexToRgb(Theme.buttonBackground);
  button.style.color = Theme.buttonTextColor;
  button.style.transition = 'background 80ms ease';
  bindButtonHover(
    button,
    hexToRgb(Theme.buttonHoverColor),
    hexToRgb(Theme.buttonBackground)
  );
}

/**
 * Styles a text input using editor input tokens.
 * @param input Text input element.
 */
function styleSettingsTextInput(input: HTMLInputElement): void {
  input.style.width = '100%';
  input.style.boxSizing = 'border-box';
  input.style.padding = '4px 6px';
  input.style.borderRadius = '2px';
  input.style.border = `1px solid ${Theme.inputBorderColor}`;
  input.style.background = Theme.inputBackgroundColor;
  input.style.color = Theme.inputTextColor;
  input.style.fontFamily = Theme.uiFontFamily;
  input.style.fontSize = '12px';
  input.style.outline = 'none';
}

/**
 * Binds hover background feedback for a button.
 * @param button Button element.
 * @param hoverColor Hover background.
 * @param idleColor Resting background.
 */
function bindButtonHover(
  button: HTMLButtonElement,
  hoverColor: string,
  idleColor: string
): void {
  button.addEventListener('mouseenter', () => {
    button.style.background = hoverColor;
  });
  button.addEventListener('mouseleave', () => {
    button.style.background = idleColor;
  });
}
