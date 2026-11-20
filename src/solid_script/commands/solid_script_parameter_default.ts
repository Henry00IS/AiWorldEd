import type { SolidScriptCommandParameter } from './solid_script_command.js';

/**
 * Folds a field value for default comparison: trim, lowercase, and one space
 * after each comma, so "Center,Center,Center" matches "Center, Center,
 * Center".
 *
 * @param text Field text.
 * @returns Normalized text.
 */
export function solidScriptParameterTextNormalized(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ');
}

/**
 * Returns the text a field uses when empty is filled in with its default.
 *
 * @param text Stored text, or nothing.
 * @param fallback Declared default.
 * @returns Stored text, or the default when it is empty.
 */
export function solidScriptParameterValueEffective(text: string | undefined, fallback: string): string {
  const given = text ?? '';
  return given.trim() === '' ? fallback : given;
}

/**
 * Tells whether a field is at its default, empty or typed, compared folded.
 *
 * @param text Stored or shown text.
 * @param fallback Declared default.
 * @returns True when it equals the default.
 */

/**
 * Tells whether a field may stay empty: it is marked optional, or it has a
 * declared default that empty uses.
 *
 * @param parameter Field.
 * @returns True when empty is allowed.
 */
export function solidScriptParameterAllowsEmpty(
  parameter: Pick<SolidScriptCommandParameter, 'optional' | 'default'>,
): boolean {
  return parameter.optional === true || parameter.default.trim() !== '';
}

export function solidScriptParameterValueIsDefault(text: string, fallback: string): boolean {
  const given = solidScriptParameterValueEffective(text, fallback);
  return solidScriptParameterTextNormalized(given) === solidScriptParameterTextNormalized(fallback);
}

/**
 * Tells whether text is a value that can be typed into a field as-is, such as
 * Additive or [$Selected.Faces], not a description of what empty means.
 *
 * @param parameter Field.
 * @param text Candidate placeholder or default.
 * @returns True when it can be typed as the field's value.
 */
export function solidScriptParameterPlaceholderValue(parameter: SolidScriptCommandParameter, text: string): boolean {
  const value = text.trim();
  if (value === '') return false;
  if (parameter.words?.some((entry) => solidScriptParameterValueIsDefault(value, entry.word))) return true;
  if (parameter.type === 'boolean' && (value === 'Yes' || value === 'No' || value === 'yes' || value === 'no'))
    return true;
  if (solidScriptParameterPlaceholderReference(value)) return true;
  if (parameter.default !== '' && solidScriptParameterValueIsDefault(value, parameter.default)) return true;
  return solidScriptParameterPlaceholderNumber(value);
}

/**
 * Tells whether text is a lone variable or system list, such as [Wall] or
 * [$Selected.Faces].
 *
 * @param text Field text.
 * @returns True when it is a bracketed name.
 */
function solidScriptParameterPlaceholderReference(text: string): boolean {
  return /^\[\s*\$?[A-Za-z_][\w.]*(?:\s*\([^[\]]*\))?\s*\]$/.test(text);
}

/**
 * Tells whether text is one or more numbers separated by commas, such as 16 or
 * 1, 1, 1.
 *
 * @param text Field text.
 * @returns True when it is only numbers.
 */
function solidScriptParameterPlaceholderNumber(text: string): boolean {
  return /^-?\d+(\.\d+)?(\s*,\s*-?\d+(\.\d+)?)*$/.test(text);
}

/**
 * Returns the greyed text an empty field shows: a typeable value, either the
 * declared default or the value an optional empty field uses, such as
 * [$Selected.Faces]. Descriptions of what empty means are not shown.
 *
 * @param parameter Field.
 * @returns Placeholder text, or empty when there is none.
 */
export function solidScriptParameterPlaceholder(parameter: SolidScriptCommandParameter): string {
  if (parameter.default.trim() !== '' && solidScriptParameterPlaceholderValue(parameter, parameter.default))
    return parameter.default;
  const candidate = parameter.placeholder ?? '';
  if (parameter.optional === true && solidScriptParameterPlaceholderValue(parameter, candidate)) return candidate;
  return '';
}
