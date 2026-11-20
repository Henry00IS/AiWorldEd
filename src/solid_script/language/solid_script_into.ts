/**
 * Names and roles of Into-style fields: a copy holds a brush or mesh result, a
 * label only names new faces, edges, points or other values.
 */

/** How an Into-style field behaves when it is set. */
export type SolidScriptInto = 'copy' | 'label';

/** A command field that may be an Into-style name. */
export interface SolidScriptIntoField {
  /** Stored key of the field. */
  readonly key: string;
  /** Copy or label role, when this field is an Into-style name. */
  readonly into?: SolidScriptInto;
}

/**
 * Variable name typed in an Into-style field, with surrounding brackets
 * stripped, or empty when the field is blank.
 *
 * @param text Stored or default field text.
 * @returns Variable name, or empty.
 */
export function solidScriptIntoName(text: string): string {
  return text
    .trim()
    .replace(/^\[(.*)\]$/s, '$1')
    .trim();
}

/**
 * Variable a copy-style Into field names on this line, or empty when none is
 * set, so label fields do not withhold or copy.
 *
 * @param parameters Fields of the command.
 * @param text Stored or default text of a field by key.
 * @returns Variable name, or empty.
 */
export function solidScriptIntoCopyName(
  parameters: readonly SolidScriptIntoField[],
  text: (key: string) => string,
): string {
  for (const field of parameters) {
    if (field.into !== 'copy') continue;
    const name = solidScriptIntoName(text(field.key));
    if (name !== '') return name;
  }
  return '';
}
