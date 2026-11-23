/**
 * Turns a name such as MySlider, UScale or ItemMAXValue into the words shown
 * for it when nothing else names it: a capital after a lower case letter and
 * the last capital of a run before a lower case letter start a new word,
 * underscores become spaces and the first letter is a capital.
 *
 * @param name Name as written.
 * @returns Name in words, such as My Slider, U Scale or Item MAX Value.
 */
export function solidScriptNameWords(name: string): string {
  const words = name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/_+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
