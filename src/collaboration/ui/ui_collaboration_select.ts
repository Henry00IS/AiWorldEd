import { Theme } from '@/theme.js';
import { UI_THEME_SELECT_ARROW_DARK } from '@/ui/theme/theme_ui_css_variables.js';

/** Opaque background of collaboration dropdowns and their option lists. */
export const UI_COLLABORATION_SELECT_BACKGROUND = 'var(--aiworlded-select-background, #262629)';
/** Text color of collaboration dropdowns and their option lists. */
export const UI_COLLABORATION_SELECT_TEXT = 'var(--aiworlded-gray-f0f0f0, #f0f0f0)';
/**
 * Down arrow drawn by the page, since the native arrow is hidden together with
 * the native look.
 */
const UI_COLLABORATION_SELECT_ARROW = `var(--aiworlded-select-arrow, ${UI_THEME_SELECT_ARROW_DARK})`;

/** One choice of a collaboration dropdown. */
export interface UiCollaborationSelectChoice {
  value: string;
  label: string;
}

/**
 * Creates a themed dropdown that renders the same in Chromium, Firefox and the
 * desktop WebKit views. WebKitGTK draws a select with a see-through background
 * as a native white box, which hid the light text, so the native look is turned
 * off and every color, including each option's, is opaque.
 *
 * @param choices Values and labels in display order; the first is selected.
 * @returns Select element.
 */
export function uiCollaborationSelect(choices: readonly UiCollaborationSelectChoice[]): HTMLSelectElement {
  const select = document.createElement('select');
  choices.forEach((choice) => select.appendChild(uiCollaborationSelectOption(choice)));
  uiCollaborationSelectStyle(select);
  select.selectedIndex = 0;
  return select;
}

/**
 * Creates one option with opaque colors for the popup list.
 *
 * @param choice Value and label.
 * @returns Option element.
 */
function uiCollaborationSelectOption(choice: UiCollaborationSelectChoice): HTMLOptionElement {
  const option = document.createElement('option');
  option.value = choice.value;
  option.textContent = choice.label;
  option.style.background = UI_COLLABORATION_SELECT_BACKGROUND;
  option.style.color = UI_COLLABORATION_SELECT_TEXT;
  return option;
}

/**
 * Applies the themed, non-native look to a select.
 *
 * @param select Select element.
 */
function uiCollaborationSelectStyle(select: HTMLSelectElement): void {
  select.style.appearance = 'none';
  select.style.setProperty('-webkit-appearance', 'none');
  select.style.colorScheme = 'var(--aiworlded-color-scheme, dark)';
  select.style.flex = '1';
  select.style.minWidth = '0';
  select.style.padding = '5px 24px 5px 6px';
  select.style.backgroundColor = UI_COLLABORATION_SELECT_BACKGROUND;
  select.style.backgroundImage = UI_COLLABORATION_SELECT_ARROW;
  select.style.backgroundRepeat = 'no-repeat';
  select.style.backgroundPosition = 'right 8px center';
  select.style.color = UI_COLLABORATION_SELECT_TEXT;
  select.style.border = '1px solid rgba(var(--aiworlded-ink-rgb, 255, 255, 255), 0.14)';
  select.style.borderRadius = '5px';
  select.style.fontFamily = Theme.uiFontFamily;
  select.style.fontSize = '12px';
}
