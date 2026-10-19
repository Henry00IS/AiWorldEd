import { InputNumeric } from './input_numeric.js';

/** Width of a UV Editor numeric field, in pixels. */
const INPUT_NUMERIC_UV_FIELD_WIDTH_PX = 48;

/** Height of a UV Editor numeric field, in pixels. */
const INPUT_NUMERIC_UV_FIELD_HEIGHT_PX = 24;

/**
 * Creates the numeric field used by the UV Editor.
 *
 * @param step Arrow step stored on the field.
 * @param ariaLabel Accessible name.
 * @returns Numeric field that parses numbers and math.
 */
export function inputNumericCreateUvField(step: number, ariaLabel?: string): InputNumeric {
  const field = inputNumericCreatePlainUvField(step);
  if (ariaLabel) field.getElement().setAttribute('aria-label', ariaLabel);
  return field;
}

/**
 * Creates the UV Editor field without an accessible name.
 *
 * @param step Arrow step stored on the field.
 * @returns Numeric field.
 */
function inputNumericCreatePlainUvField(step: number): InputNumeric {
  const width = `${INPUT_NUMERIC_UV_FIELD_WIDTH_PX}px`;
  return new InputNumeric({
    step,
    width,
    minWidth: width,
    maxWidth: width,
    height: `${INPUT_NUMERIC_UV_FIELD_HEIGHT_PX}px`,
    padding: '0 4px',
    borderRadius: '3px',
    textAlign: 'right',
  });
}
