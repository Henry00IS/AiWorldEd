/**
 * Writes a description as a sentence: a capital first letter and a full stop at
 * the end, unless it already ends with a stop, an emoji or another symbol.
 * Names of blocks stay marked in bold as **Cube**.
 *
 * @param text Description, such as "name of the editor".
 * @returns Sentence, such as "Name of the editor.".
 */
export function solidScriptSentence(text: string): string {
  const trimmed = text.trim();
  if (trimmed === '') return '';
  const start = /^(\**)([a-z])/.exec(trimmed);
  const letter = start?.[2] ?? '';
  const marks = start?.[1] ?? '';
  const capital = start ? `${marks}${letter.toUpperCase()}${trimmed.slice(start[0].length)}` : trimmed;
  return solidScriptSentenceStopped(capital) ? capital : `${capital}.`;
}

/**
 * Tells whether a sentence already ends, so a full stop is not added: a stop,
 * or an emoji or other symbol, including a trailing variation selector.
 *
 * @param text Sentence so far.
 * @returns True when it already ends.
 */
function solidScriptSentenceStopped(text: string): boolean {
  return /[.?!]$/u.test(text) || /[\p{Extended_Pictographic}\p{S}]\p{M}*$/u.test(text);
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

/**
 * The first paragraph of a description as a sentence, for places that show only
 * a short lead, such as a suggestion.
 *
 * @param text Description, which may have examples on later lines.
 * @returns First paragraph, with a full stop if it needs one.
 */
export function solidScriptSentenceLead(text: string): string {
  const lead = text.trim().split(/\n\n+/)[0] ?? '';
  return solidScriptSentence(lead);
}
