/**
 * Writes a description as a sentence: a capital first letter and a full stop at
 * the end. Names of blocks stay marked in bold as **Cube**.
 *
 * @param text Description, such as "name of the editor".
 * @returns Sentence, such as "Name of the editor.".
 */
export function solidScriptSentence(text: string): string {
  const trimmed = text.trim();
  if (trimmed === '') return '';
  const start = /^(\**)([a-z])/.exec(trimmed);
  const capital = start ? `${start[1]}${start[2]!.toUpperCase()}${trimmed.slice(start[0].length)}` : trimmed;
  return /[.?!]$/.test(capital) ? capital : `${capital}.`;
}

/**
 * Writes a description of a value as a sentence after its kind, such as "Text:
 * Name of the editor.".
 *
 * @param type Kind of the value, or empty when unknown.
 * @param text Description.
 * @returns Description with its kind.
 */
export function solidScriptSentenceTyped(type: string, text: string): string {
  const sentence = solidScriptSentence(text);
  return type === '' ? sentence : `${type}: ${sentence}`;
}

/**
 * Splits a description into its plain and bold parts, so it can be shown with
 * the names of blocks in bold.
 *
 * @param text Description with **bold** parts.
 * @returns Parts in order.
 */
export function solidScriptSentenceParts(text: string): { text: string; bold: boolean }[] {
  return text
    .split(/(\*\*[^*]+\*\*)/)
    .filter((part) => part !== '')
    .map((part) =>
      /^\*\*[^*]+\*\*$/.test(part) ? { text: part.slice(2, -2), bold: true } : { text: part, bold: false },
    );
}

/**
 * Removes the bold marks from a description, for places that show plain text
 * only, such as a tooltip.
 *
 * @param text Description with **bold** parts.
 * @returns Plain text.
 */
export function solidScriptSentencePlain(text: string): string {
  return solidScriptSentenceParts(text)
    .map((part) => part.text)
    .join('');
}
