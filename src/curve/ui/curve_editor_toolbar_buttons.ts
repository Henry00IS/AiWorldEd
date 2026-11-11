import { styleFloatingPanelChromeButton } from '@/ui/floating_panel/panel_floating_title_bar.js';
import { Theme } from '@/theme.js';
import { hexToRgb } from '@/utils/utils_color.js';
import { CURVE_UI_ACTIVE_BACKGROUND, CURVE_UI_COLORS } from './curve_ui_style.js';

/**
 * Creates a small toolbar button.
 *
 * @param label Caption.
 * @param title Tooltip.
 * @param onClick Click action.
 * @returns Button.
 */
export function curveEditorButton(label: string, title: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.title = title;
  styleFloatingPanelChromeButton(button);
  button.addEventListener('click', onClick);
  return button;
}

/**
 * Paints a toggle button active or inactive in the dark theme; an inactive
 * button keeps the normal button background.
 *
 * @param button Toggle button.
 * @param active True for the active choice.
 */
export function curveEditorButtonActive(button: HTMLButtonElement, active: boolean): void {
  button.style.background = active ? CURVE_UI_ACTIVE_BACKGROUND : hexToRgb(Theme.buttonBackground);
  button.style.borderColor = active ? CURVE_UI_COLORS.line : Theme.inputBorderColor;
  button.setAttribute('aria-pressed', active ? 'true' : 'false');
}

/**
 * Enables or disables a toolbar button, dimming it without the browser's pale
 * default disabled look.
 *
 * @param button Button.
 * @param disabled True to disable.
 */
export function curveEditorButtonEnable(button: HTMLButtonElement, disabled: boolean): void {
  button.disabled = disabled;
  button.style.opacity = disabled ? '0.45' : '1';
  button.style.cursor = disabled ? 'default' : 'pointer';
}
