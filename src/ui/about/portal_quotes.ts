/** Short Portal quotes displayed by the About dialog. */
export const PORTAL_QUOTES = [
  'The cake is a lie.',
  'This was a triumph.',
  'We do what we must because we can.',
  'There is no sense crying over every mistake.',
  'For the good of all of us, except the ones who are dead.',
  'Your business is appreciated.',
] as const;

/**
 * Selects a random quote while avoiding an immediate repeat.
 *
 * @param previousQuote Quote shown during the previous opening.
 * @param randomSource Random value provider returning a value from zero to one.
 * @returns A quote that differs from the previous quote when possible.
 */
export function selectPortalQuote(previousQuote: string | null, randomSource: () => number = Math.random): string {
  const candidates = PORTAL_QUOTES.filter((quote) => quote !== previousQuote);
  const randomIndex = Math.floor(randomSource() * candidates.length);
  const boundedIndex = Math.min(Math.max(randomIndex, 0), candidates.length - 1);
  return candidates[boundedIndex] ?? PORTAL_QUOTES[0];
}
