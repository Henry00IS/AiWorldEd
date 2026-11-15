import { modifierStackUiTextButton } from './modifier_stack_ui_style.js';

/** Explains what Convert to Brush does. */
export const MODIFIER_STACK_CONVERT_HINT =
  'Replaces the generator with the regular brushes it builds right now, so each one can be edited by hand. Undo brings the generator back.';

/**
 * Builds the Convert to Brush button shown on generator nodes.
 *
 * @param onConvert Bakes the generator into brushes.
 * @returns Button element.
 */
export function modifierStackConvertButton(onConvert: () => void): HTMLButtonElement {
  const button = modifierStackUiTextButton('Convert to Brush', MODIFIER_STACK_CONVERT_HINT, () => onConvert());
  button.dataset['generatorConvert'] = '';
  Object.assign(button.style, {
    flex: '1 1 110px',
    minWidth: '0',
    whiteSpace: 'nowrap',
    height: '26px',
    padding: '0 8px',
  });
  return button;
}
